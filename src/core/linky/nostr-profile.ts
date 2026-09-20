import { decode } from "nostr-tools/nip19"
import { finalizeEvent } from "nostr-tools/pure"
import { z } from "zod"

import { normalizeProfileName } from "@/core/linky/profile-name.ts"

/** What Payky shows and edits of the account's Nostr (kind-0) profile. */
export interface NostrProfile {
  /** Published name, normalized; `null` until the user sets one. */
  readonly name: string | null
  /** A URL the browser can render; `null` when none is published. */
  readonly pictureUrl: string | null
  /**
   * The published metadata as-is, so an edit republishes every field the
   * user set elsewhere (lud16, nip05, about, ...) unchanged.
   */
  readonly metadata: Readonly<Record<string, unknown>>
}

const EMPTY_PROFILE: NostrProfile = {
  name: null,
  pictureUrl: null,
  metadata: {},
}

const ProfileMetadataSchema = z.looseObject({
  name: z.string().optional(),
  display_name: z.string().optional(),
  displayName: z.string().optional(),
  picture: z.string().optional(),
})

const isDisplayablePictureUrl = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.startsWith("data:image/")) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * The profile a kind-0 event's content describes, resolved as Linky does:
 * `display_name` before `name`, both normalized, and only a URL the browser
 * can render as a picture. `null` when the content is not a metadata object.
 */
export const parseProfileMetadata = (content: string): NostrProfile | null => {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return null
  }
  const parsed = ProfileMetadataSchema.safeParse(json)
  if (!parsed.success) return null

  const displayName = normalizeProfileName(
    parsed.data.display_name ?? parsed.data.displayName ?? ""
  )
  const name = normalizeProfileName(parsed.data.name ?? "")
  const picture = parsed.data.picture ?? ""

  return {
    name: displayName || name || null,
    pictureUrl: isDisplayablePictureUrl(picture) ? picture.trim() : null,
    metadata: parsed.data,
  }
}

const withRelays = async <T>(
  relays: ReadonlyArray<string>,
  use: (
    pool: InstanceType<typeof import("nostr-tools/pool").SimplePool>
  ) => Promise<T>
): Promise<T> => {
  const { SimplePool } = await import("nostr-tools/pool")
  const pool = new SimplePool()
  try {
    return await use(pool)
  } finally {
    pool.close([...relays])
  }
}

/** The newest kind-0 event any of `relays` holds for `pubkey`, or an empty profile. */
export const fetchNostrProfile = async ({
  pubkey,
  relays,
  signal,
}: {
  readonly pubkey: string
  readonly relays: ReadonlyArray<string>
  readonly signal?: AbortSignal
}): Promise<NostrProfile> => {
  try {
    return await withRelays(relays, async (pool) => {
      const event = await pool.get(
        [...relays],
        { kinds: [0], authors: [pubkey] },
        { maxWait: 6_000 }
      )
      if (signal?.aborted || event === null) return EMPTY_PROFILE
      return parseProfileMetadata(event.content) ?? EMPTY_PROFILE
    })
  } catch {
    return EMPTY_PROFILE
  }
}

/**
 * The metadata to publish after the user edited `name` and/or the picture.
 * Everything else the current event carries stays; Linky writes the name as
 * both `name` and `display_name`, so both are set — or both cleared.
 */
export const buildUpdatedProfileMetadata = ({
  current,
  name,
  pictureUrl,
}: {
  readonly current: Readonly<Record<string, unknown>>
  readonly name: string
  readonly pictureUrl: string | null
}): Record<string, unknown> => {
  const {
    name: _name,
    display_name: _displayName,
    displayName: _camelDisplayName,
    picture: _picture,
    ...rest
  } = current
  const normalizedName = normalizeProfileName(name)

  return {
    ...rest,
    ...(normalizedName
      ? { name: normalizedName, display_name: normalizedName }
      : {}),
    ...(pictureUrl === null ? {} : { picture: pictureUrl }),
  }
}

export class NostrPublishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NostrPublishError"
  }
}

const secretKeyFromNsec = (nsec: string): Uint8Array => {
  const decoded = decode(nsec.trim())
  if (decoded.type !== "nsec") {
    throw new NostrPublishError("The active key is not an nsec.")
  }
  return decoded.data
}

/**
 * Signs `metadata` as a kind-0 event with the account's key and publishes
 * it to `relays`; resolves once at least one relay accepted it.
 */
export const publishNostrProfile = async ({
  nsec,
  relays,
  metadata,
}: {
  readonly nsec: string
  readonly relays: ReadonlyArray<string>
  readonly metadata: Readonly<Record<string, unknown>>
}): Promise<void> => {
  const event = finalizeEvent(
    {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(metadata),
    },
    secretKeyFromNsec(nsec)
  )

  await withRelays(relays, async (pool) => {
    try {
      await Promise.any(pool.publish([...relays], event))
    } catch {
      throw new NostrPublishError("No relay accepted the profile event.")
    }
  })
}
