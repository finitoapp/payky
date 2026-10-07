import { GiftWrap, Seal } from "nostr-tools/kinds"
import { decrypt, getConversationKey } from "nostr-tools/nip44"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import {
  type Event,
  type EventTemplate,
  finalizeEvent,
  getEventHash,
  getPublicKey,
  type VerifiedEvent,
  verifyEvent,
} from "nostr-tools/pure"
import { z } from "zod"

import {
  isPublishAccepted,
  type NostrDep,
  RELAY_MAX_WAIT_MS,
} from "@/core/integrations/nostr/nostr-client.ts"
import type { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"
import { jsonCodec } from "@/zod-utils.ts"

/**
 * NIP-59 gift wraps: a rumor sealed by its author and wrapped for one
 * recipient. Shared by the support chat and the PoS station protocol.
 */

const EventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number().int(),
  kind: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
})
const SealSchema = EventSchema.extend({ sig: z.string() })
const EventJson = jsonCodec(EventSchema)
const SealJson = jsonCodec(SealSchema)

/** An unsigned event whose author the seal's signature vouches for. */
export type VerifiedRumor = z.output<typeof EventSchema>

const decryptJson = <T>(
  codec: z.ZodType<T, string>,
  payload: string,
  secretKey: NostrSecretKey,
  pubkey: string
) =>
  z.safeDecode(codec, decrypt(payload, getConversationKey(secretKey, pubkey)))

/**
 * The rumor inside a gift wrap addressed to `secretKey`, or `null`.
 * nostr-tools' `unwrapEvent` checks nothing, so this verifies the seal's
 * signature, that the seal and the rumor share their author and that the
 * rumor's id is its hash: without that anyone could write as anyone.
 */
export const unwrapVerifiedRumor = ({
  wrap,
  secretKey,
}: {
  readonly wrap: Event
  readonly secretKey: NostrSecretKey
}): VerifiedRumor | null => {
  if (wrap.kind !== GiftWrap) return null
  try {
    const seal = decryptJson(SealJson, wrap.content, secretKey, wrap.pubkey)
    if (!seal.success || seal.data.kind !== Seal || !verifyEvent(seal.data)) {
      return null
    }
    const rumor = decryptJson(
      EventJson,
      seal.data.content,
      secretKey,
      seal.data.pubkey
    )
    return rumor.success &&
      rumor.data.pubkey === seal.data.pubkey &&
      getEventHash(rumor.data) === rumor.data.id
      ? rumor.data
      : null
  } catch {
    // Not encrypted to this key.
    return null
  }
}

/** A rumor sealed by `senderSecretKey` and wrapped for `recipientPubkey`. */
export const createGiftWrap = ({
  kind,
  content,
  tags,
  senderSecretKey,
  recipientPubkey,
  createdAt,
}: {
  readonly kind: number
  readonly content: string
  readonly tags: ReadonlyArray<ReadonlyArray<string>>
  readonly senderSecretKey: NostrSecretKey
  readonly recipientPubkey: string
  /** Unix seconds. */
  readonly createdAt: number
}): Event =>
  createWrap(
    createSeal(
      createRumor(
        {
          kind,
          content,
          tags: tags.map((tag) => [...tag]),
          created_at: createdAt,
        },
        senderSecretKey
      ),
      senderSecretKey,
      recipientPubkey
    ),
    recipientPubkey
  )

/** Answers a relay's NIP-42 AUTH challenge with `secretKey`. */
export const authSigner =
  (secretKey: NostrSecretKey) =>
  async (template: EventTemplate): Promise<VerifiedEvent> =>
    finalizeEvent(template, secretKey)

/** Whether any of the app's relays accepted `event`. */
export const publishGiftWrap = async (
  nostr: NostrDep["nostr"],
  event: Event,
  authKey: NostrSecretKey
): Promise<boolean> =>
  isPublishAccepted(
    await Promise.allSettled(
      nostr.pool.publish([...nostr.relays], event, {
        maxWait: RELAY_MAX_WAIT_MS,
        onauth: authSigner(authKey),
      })
    )
  )

/** How far back NIP-59 may date a gift wrap, so how far back to listen. */
export const WRAP_BACKDATE_SECONDS = 2 * 24 * 60 * 60

/**
 * Listens for gift wraps to `secretKey`'s pubkey, from two days back: a
 * fresh wrap carries a randomized past `created_at`. `onClose` fires once
 * every relay dropped the subscription; returns the function that ends it,
 * which does not call `onClose`.
 */
export const subscribeGiftWraps = (
  nostr: NostrDep["nostr"],
  {
    secretKey,
    relays = nostr.relays,
    sinceSeconds,
    onWrap,
    onClose,
  }: {
    readonly secretKey: NostrSecretKey
    readonly relays?: ReadonlyArray<string>
    /** Unix seconds; wraps older than this are not asked for. */
    readonly sinceSeconds: number
    readonly onWrap: (wrap: Event) => void
    readonly onClose: () => void
  }
): (() => void) => {
  let closedByCaller = false
  const subscription = nostr.pool.subscribeMany(
    [...relays],
    {
      kinds: [GiftWrap],
      "#p": [getPublicKey(secretKey)],
      since: sinceSeconds,
    },
    {
      onevent: onWrap,
      onclose: () => {
        if (!closedByCaller) onClose()
      },
      onauth: authSigner(secretKey),
    }
  )
  return () => {
    closedByCaller = true
    subscription.close()
  }
}

const RESUBSCRIBE_MIN_MS = 5_000
const RESUBSCRIBE_MAX_MS = 5 * 60_000

/**
 * {@link subscribeGiftWraps} for a background job: once every relay dropped
 * it, it subscribes again after a growing pause, reaching back two days and
 * ten minutes so nothing sent meanwhile is missed. A wrap may therefore
 * arrive more than once. Returns the function that ends it.
 */
export const watchGiftWraps = (
  nostr: NostrDep["nostr"],
  {
    secretKey,
    nowSeconds,
    onWrap,
  }: {
    readonly secretKey: NostrSecretKey
    readonly nowSeconds: () => number
    readonly onWrap: (wrap: Event) => void
  }
): (() => void) => {
  let stopped = false
  let unsubscribe: (() => void) | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryMs = RESUBSCRIBE_MIN_MS

  const subscribe = (): void => {
    if (stopped) return
    const subscribedAt = Date.now()
    unsubscribe = subscribeGiftWraps(nostr, {
      secretKey,
      sinceSeconds: nowSeconds() - WRAP_BACKDATE_SECONDS - 10 * 60,
      onWrap,
      onClose: () => {
        // A subscription that lasted resets the pause.
        if (Date.now() - subscribedAt > RESUBSCRIBE_MAX_MS) {
          retryMs = RESUBSCRIBE_MIN_MS
        }
        retryTimer = setTimeout(subscribe, retryMs)
        retryMs = Math.min(retryMs * 2, RESUBSCRIBE_MAX_MS)
      },
    })
  }

  subscribe()

  return () => {
    stopped = true
    clearTimeout(retryTimer)
    unsubscribe?.()
  }
}
