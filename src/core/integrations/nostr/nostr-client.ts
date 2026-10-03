import { err, ok, type Task } from "@evolu/common"
import type { AbstractSimplePool } from "nostr-tools/abstract-pool"
import { npubEncode } from "nostr-tools/nip19"
import { SimplePool } from "nostr-tools/pool"
import { finalizeEvent, getPublicKey } from "nostr-tools/pure"
import { normalizeURL } from "nostr-tools/utils"
import { z } from "zod"

import { appEnv } from "@/core/app-env.ts"
import type { DateDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  deriveNostrSecretKey,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

const PROFILE_KIND = 0
export const RELAY_MAX_WAIT_MS = 6_000

export interface NostrDep {
  readonly nostr: {
    readonly relays: ReadonlyArray<string>
    readonly pool: Pick<
      AbstractSimplePool,
      | "get"
      | "publish"
      | "listConnectionStatus"
      | "subscribeMany"
      | "subscribeManyEose"
    >
  }
}

// ponytail: one pool for the app's lifetime, so relay sockets stay open
// between reads and publishes; close it on account switch if that matters.
let sharedPool: SimplePool | undefined

export const createNostrDep = (): NostrDep => {
  sharedPool ??= new SimplePool()
  return {
    nostr: {
      relays: appEnv.VITE_PAYKY_NOSTR_RELAYS,
      pool: sharedPool,
    },
  }
}

export interface NostrIdentity {
  /** Hex public key, what relays are queried by. */
  readonly pubkey: string
  readonly npub: string
}

export const getNostrIdentity = (masterKey: MasterKey): NostrIdentity => {
  const pubkey = getPublicKey(deriveNostrSecretKey(masterKey))
  return { pubkey, npub: npubEncode(pubkey) }
}

/** `npub1abcd…wxyz` for labels; the full npub stays in the copy action. */
export const shortenNpub = (npub: string): string =>
  npub.length <= 20 ? npub : `${npub.slice(0, 12)}…${npub.slice(-6)}`

/** What Payky shows and edits of a kind-0 profile. */
export interface NostrProfile {
  readonly name: string | null
  readonly picture: string | null
  /**
   * The published metadata as-is, so an edit republishes every field set
   * elsewhere (lud16, nip05, about, ...) unchanged.
   */
  readonly metadata: Readonly<Record<string, unknown>>
}

export const emptyNostrProfile: NostrProfile = {
  name: null,
  picture: null,
  metadata: {},
}

const ProfileMetadataSchema = z.looseObject({
  name: z.string().optional(),
  display_name: z.string().optional(),
  picture: z.string().optional(),
})

const isDisplayablePicture = (value: string): boolean => {
  if (value.startsWith("data:image/")) return true
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/** `display_name` before `name`, as Linky reads it; `null` for non-metadata. */
export const profileFromMetadata = (value: unknown): NostrProfile | null => {
  const parsed = ProfileMetadataSchema.safeParse(value)
  if (!parsed.success) return null

  const name = (parsed.data.display_name ?? parsed.data.name ?? "").trim()
  const picture = (parsed.data.picture ?? "").trim()
  return {
    name: name === "" ? null : name,
    picture: isDisplayablePicture(picture) ? picture : null,
    metadata: parsed.data,
  }
}

/** A kind-0 event's content as a profile; `null` when it is not metadata. */
export const parseProfileMetadata = (content: string): NostrProfile | null => {
  try {
    return profileFromMetadata(JSON.parse(content))
  } catch {
    return null
  }
}

/**
 * The metadata to publish after an edit. Everything else stays; the name is
 * written as both `name` and `display_name`, as Linky does — or both cleared.
 */
export const mergeProfileMetadata = ({
  current,
  name,
  picture,
}: {
  readonly current: Readonly<Record<string, unknown>>
  readonly name: string
  readonly picture: string | null
}): Record<string, unknown> => {
  const {
    name: _name,
    display_name: _displayName,
    picture: _picture,
    ...rest
  } = current
  const trimmed = name.trim()
  return {
    ...rest,
    ...(trimmed === "" ? {} : { name: trimmed, display_name: trimmed }),
    ...(picture === null ? {} : { picture }),
  }
}

export const createNostrRelaysUnreachableError = defineError(
  "NostrRelaysUnreachableError"
)()
export type NostrRelaysUnreachableError = ReturnType<
  typeof createNostrRelaysUnreachableError
>

export const createNostrPublishRejectedError = defineError(
  "NostrPublishRejectedError"
)<{ readonly reasons: ReadonlyArray<string> }>()
export type NostrPublishRejectedError = ReturnType<
  typeof createNostrPublishRejectedError
>

/**
 * The newest kind-0 event the relays hold, or the empty profile. Fails when
 * no relay connected: "no profile" and "no answer" look alike to the pool,
 * and treating the latter as empty would let a save wipe the real profile.
 */
export const fetchNostrProfile =
  ({
    pubkey,
    extraRelays = [],
  }: {
    readonly pubkey: string
    /**
     * Read on top of the app's relays, such as the profile indexers that
     * hold the support team's names; never written to.
     */
    readonly extraRelays?: ReadonlyArray<string>
  }): Task<NostrProfile, NostrRelaysUnreachableError, NostrDep> =>
  async (run) => {
    const { pool, relays } = run.deps.nostr
    const readRelays = [...new Set([...relays, ...extraRelays])]
    // The pool keeps the newest event of all of them.
    const event = await pool.get(
      readRelays,
      { kinds: [PROFILE_KIND], authors: [pubkey] },
      { maxWait: RELAY_MAX_WAIT_MS }
    )
    if (event !== null) {
      return ok(parseProfileMetadata(event.content) ?? emptyNostrProfile)
    }

    return isAnyRelayConnected(pool, readRelays)
      ? ok(emptyNostrProfile)
      : err(createNostrRelaysUnreachableError())
  }

/** Signs `metadata` with the account's key; ok once any relay accepted it. */
export const publishNostrProfile =
  ({
    metadata,
  }: {
    readonly metadata: Readonly<Record<string, unknown>>
  }): Task<
    void,
    NostrPublishRejectedError,
    NostrDep & MasterKeyDep & DateDep
  > =>
  async (run) => {
    const { pool, relays } = run.deps.nostr
    const event = finalizeEvent(
      {
        kind: PROFILE_KIND,
        created_at: Math.floor(run.deps.date.now().getTime() / 1000),
        tags: [],
        content: JSON.stringify(metadata),
      },
      deriveNostrSecretKey(run.deps.masterKey)
    )

    const results = await Promise.allSettled(
      pool.publish([...relays], event, { maxWait: RELAY_MAX_WAIT_MS })
    )
    if (isPublishAccepted(results)) return ok()

    return err(
      createNostrPublishRejectedError({ reasons: publishReasons(results) })
    )
  }

/**
 * A relay that cannot be reached resolves with a "connection failure" string
 * instead of rejecting, so successes are counted explicitly.
 */
export const isPublishAccepted = (
  results: ReadonlyArray<PromiseSettledResult<string>>
): boolean =>
  results.some(
    (result) =>
      result.status === "fulfilled" &&
      !result.value.startsWith("connection failure")
  )

export const publishReasons = (
  results: ReadonlyArray<PromiseSettledResult<string>>
): ReadonlyArray<string> =>
  results.map((result) =>
    result.status === "fulfilled" ? result.value : String(result.reason)
  )

/**
 * Whether any of `relays` is connected — what tells "nothing stored" from
 * "nobody answered" after an empty read of them. Only those: the shared pool
 * also holds sockets to relays this read never asked.
 */
export const isAnyRelayConnected = (
  pool: Pick<AbstractSimplePool, "listConnectionStatus">,
  relays: ReadonlyArray<string>
): boolean => {
  const status = pool.listConnectionStatus()
  return relays.some((relay) => status.get(normalizeURL(relay)) === true)
}
