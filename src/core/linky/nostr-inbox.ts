import type { Event } from "nostr-tools/pure"

/** NIP-59: the outer, publicly visible envelope of a private message. */
export const GIFT_WRAP_KIND = 1059
/** NIP-17: the chat message inside; a cashu token travels as one. */
export const CHAT_RUMOR_KIND = 14
/**
 * NIP-59 randomizes a wrap's `created_at` up to two days into the past, so a
 * subscription that wants every wrap since a moment has to look back that far.
 */
export const GIFT_WRAP_TIMESTAMP_SKEW_SECONDS = 2 * 24 * 60 * 60

/** The message a gift wrap carried, with what the inbox needs of it. */
export interface UnwrappedRumor {
  readonly id: string
  readonly kind: number
  /** The sender's public key, as the seal names it. */
  readonly pubkey: string
  readonly content: string
  readonly createdAt: number
}

/**
 * Opens a wrap addressed to `secretKey`'s public key; `null` for a wrap that
 * was not for this key or is malformed — both ordinary on a shared relay.
 */
export const unwrapGiftWrap = async (
  wrap: Event,
  secretKey: Uint8Array
): Promise<UnwrappedRumor | null> => {
  const { unwrapEvent } = await import("nostr-tools/nip59")
  try {
    const rumor = unwrapEvent(wrap, secretKey)
    return {
      id: rumor.id,
      kind: rumor.kind,
      pubkey: rumor.pubkey,
      content: rumor.content,
      createdAt: rumor.created_at,
    }
  } catch {
    return null
  }
}

export interface GiftWrapSubscription {
  readonly close: () => void
}

export type SubscribeGiftWraps = (params: {
  readonly relays: ReadonlyArray<string>
  /** Hex public key the wraps are addressed to (`p` tag). */
  readonly pubkey: string
  /** Unix seconds; wraps stamped earlier are not requested. */
  readonly since: number
  readonly onWrap: (wrap: Event) => void
}) => Promise<GiftWrapSubscription>

/** A live subscription to every gift wrap for `pubkey` on `relays`. */
export const subscribeGiftWraps: SubscribeGiftWraps = async ({
  relays,
  pubkey,
  since,
  onWrap,
}) => {
  const { SimplePool } = await import("nostr-tools/pool")
  const pool = new SimplePool()
  const subscription = pool.subscribeMany(
    [...relays],
    { kinds: [GIFT_WRAP_KIND], "#p": [pubkey], since },
    { onevent: onWrap }
  )
  return {
    close: () => {
      subscription.close()
      pool.close([...relays])
    },
  }
}
