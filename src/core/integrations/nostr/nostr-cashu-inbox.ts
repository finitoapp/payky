import { ok, type Task } from "@evolu/common"
import { GiftWrap, PrivateDirectMessage } from "nostr-tools/kinds"
import type { Event } from "nostr-tools/pure"
import { getPublicKey } from "nostr-tools/pure"

import {
  type CashuPaymentPayload,
  decodeCashuPaymentPayload,
} from "@/core/cashu/cashu-payment-request.ts"
import type { DateDep, MasterKeyDep } from "@/core/deps.ts"
import type { NostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import {
  authSigner,
  queryWithAuth,
  rumorRoom,
  unwrapVerifiedRumor,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import type { CashuTokenText } from "@/core/modules/cashu/cashu-types.ts"
import { normalizeCashuTokenText } from "@/core/modules/cashu/cashu-utils.ts"
import {
  deriveNostrSecretKey,
  type NostrSecretKey,
} from "@/core/modules/shared/key-derivation.ts"

/**
 * Cashu payments arriving over NIP-17 (cashu.md §5 "Token"): the NUT-18
 * request's nostr transport delivers a token to Payky's key. The inbox is
 * shared with the support chat and with Linky's chats, so a rumor counts only
 * when its room is 1:1 (the sender and Payky's key) and it is a kind 14
 * message whose content is a NUT-18 payload or a bare `cashuA…`/`cashuB…`
 * token. Anything else is someone talking to the owner, and is dropped
 * without logging or storing it.
 */

export interface CashuTokenMessage {
  readonly rumorId: string
  readonly sender: string
  readonly sentAt: number
  /** The text a receive takes, normalised as Linky normalises it. */
  readonly tokenText: CashuTokenText
  /** The NUT-18 payload, or null for a bare token (Linky sends those). */
  readonly payload: CashuPaymentPayload | null
}

/** NIP-59 dates a gift wrap up to two days back, so a window may never be shorter. */
export const MIN_LOOKBACK_SECONDS = 2 * 24 * 60 * 60
/** How far back the listener reads; the NIP-17 message is the queue (decision 12). */
export const CASHU_INBOX_LOOKBACK_SECONDS = 7 * 24 * 60 * 60

export const decodeCashuTokenWrap = ({
  wrap,
  secretKey,
}: {
  readonly wrap: Event
  readonly secretKey: NostrSecretKey
}): CashuTokenMessage | null => {
  const rumor = unwrapVerifiedRumor({ wrap, secretKey })
  if (rumor === null || rumor.kind !== PrivateDirectMessage) return null
  const me = getPublicKey(secretKey)
  const room = rumorRoom(rumor)
  if (room.size !== 2 || !room.has(me) || rumor.pubkey === me) return null
  const content = rumor.content.trim()
  const payload = content.startsWith("{")
    ? decodeCashuPaymentPayload(content)
    : null
  if (payload === null && !/^cashu[AB]/u.test(content)) return null
  const tokenText = normalizeCashuTokenText(content)
  if (tokenText === null) return null
  return {
    rumorId: rumor.id,
    sender: rumor.pubkey,
    sentAt: rumor.created_at,
    tokenText,
    payload,
  }
}

const filterFor = (secretKey: NostrSecretKey, since: number) => ({
  kinds: [GiftWrap],
  "#p": [getPublicKey(secretKey)],
  since,
})

/** Every token message in the look-back window, from the relays Payky listens on. */
export const fetchCashuTokenMessages: Task<
  ReadonlyArray<CashuTokenMessage>,
  never,
  NostrDep & MasterKeyDep & DateDep
> = async (run) => {
  const secretKey = deriveNostrSecretKey(run.deps.masterKey)
  const now = Math.floor(run.deps.date.now().getTime() / 1000)
  const wraps = await queryWithAuth(
    run.deps.nostr.pool,
    run.deps.nostr.relays,
    filterFor(secretKey, now - CASHU_INBOX_LOOKBACK_SECONDS),
    secretKey
  )
  return ok(
    wraps.flatMap((wrap) => {
      const message = decodeCashuTokenWrap({ wrap, secretKey })
      return message === null ? [] : [message]
    })
  )
}

/** New token messages as the relays store them; returns the function that stops it. */
export const subscribeCashuTokenMessages = (
  { nostr, masterKey, date }: NostrDep & MasterKeyDep & DateDep,
  onMessage: (message: CashuTokenMessage) => void
): (() => void) => {
  const secretKey = deriveNostrSecretKey(masterKey)
  const subscription = nostr.pool.subscribeMany(
    [...nostr.relays],
    filterFor(
      secretKey,
      Math.floor(date.now().getTime() / 1000) - MIN_LOOKBACK_SECONDS
    ),
    {
      onevent: (wrap) => {
        const message = decodeCashuTokenWrap({ wrap, secretKey })
        if (message !== null) onMessage(message)
      },
      onauth: authSigner(secretKey),
    }
  )
  return () => subscription.close()
}
