import { PrivateDirectMessage } from "nostr-tools/kinds"
import { type Event, getPublicKey } from "nostr-tools/pure"

import {
  rumorRoom,
  type SupportTeam,
  unwrapVerifiedRumor,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import type { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

/**
 * What the support bot decides on its own (support/0004): which messages are
 * a merchant's support conversation, where a conversation starts, and
 * whether the bot answers it at all. Everything here is pure, so restarting
 * the bot rebuilds the same decisions from the relays' history.
 */

export interface BotMessage {
  /** The rumor id, the same in every member's copy. */
  readonly id: string
  /** Hex pubkey of the author. */
  readonly author: string
  /** As sent, the app's trailer included. */
  readonly text: string
  /** Unix seconds, from the rumor, so from the author's clock. */
  readonly sentAt: number
  /**
   * Unix seconds by the bot's clock: when a live message arrived, or its
   * `sentAt` when it came from the history. The timing rules use this, so a
   * phone whose clock is off does not make its messages look stale.
   */
  readonly receivedAt: number
  /** The room: the author and every `p` tag, so where a reply goes. */
  readonly members: ReadonlyArray<string>
}

/**
 * A gift wrap to the bot as a message of one merchant's support room — or
 * `null`. The room must hold a whole team line-up, current or former, plus
 * exactly one other pubkey: that one is the merchant. A team member's 1:1
 * with the bot, or a room with a stranger beside the merchant, is not
 * support's.
 */
export const decodeBotWrap = ({
  wrap,
  secretKey,
  team,
  now,
  live,
}: {
  readonly wrap: Event
  readonly secretKey: NostrSecretKey
  readonly team: SupportTeam
  /** Unix seconds by the bot's clock. */
  readonly now: number
  /** Arrived after the relays sent what they had stored. */
  readonly live: boolean
}): { readonly merchant: string; readonly message: BotMessage } | null => {
  const rumor = unwrapVerifiedRumor({ wrap, secretKey })
  // A reaction, the bot's own 👀 included, is not a word in the conversation.
  if (rumor === null || rumor.kind !== PrivateDirectMessage) return null
  const room = rumorRoom(rumor)
  const bot = getPublicKey(secretKey)
  if (!room.has(bot)) return null

  for (const lineUp of [team.pubkeys, ...team.formerTeams]) {
    if (!lineUp.every((pubkey) => room.has(pubkey))) continue
    const [merchant, ...more] = [...room].filter(
      (pubkey) => !lineUp.includes(pubkey)
    )
    if (
      merchant === undefined ||
      more.length > 0 ||
      // A member of today's team is never the merchant: a member's 1:1
      // with the bot matches a former line-up of that member alone.
      merchant === bot ||
      team.pubkeys.includes(merchant)
    ) {
      continue
    }
    return {
      merchant,
      message: {
        id: rumor.id,
        author: rumor.pubkey,
        text: rumor.content,
        sentAt: rumor.created_at,
        receivedAt: live ? now : Math.min(now, rumor.created_at),
        members: [...room],
      },
    }
  }
  return null
}

/**
 * Silence this long starts a new conversation (support/0004), so a person's
 * reply or the bot's hand-over keeps it quiet no longer than that.
 */
export const CONVERSATION_GAP_SECONDS = 6 * 60 * 60

/** The rolling day the reply limits count over, across conversations. */
export const LIMIT_WINDOW_SECONDS = 24 * 60 * 60

/**
 * The messages since the last silence of six hours, oldest first. The bot's
 * memory is this conversation only: an earlier one neither feeds the model
 * nor keeps the bot quiet.
 */
export const currentConversation = (
  messages: ReadonlyArray<BotMessage>
): ReadonlyArray<BotMessage> => {
  const sorted = [...messages].sort((a, b) => a.sentAt - b.sentAt)
  let start = sorted.length - 1
  while (start > 0) {
    const previous = sorted[start - 1]
    const current = sorted[start]
    if (
      previous === undefined ||
      current === undefined ||
      current.sentAt - previous.sentAt >= CONVERSATION_GAP_SECONDS
    ) {
      break
    }
    start -= 1
  }
  return sorted.slice(Math.max(start, 0))
}

/** How long the bot waits for the merchant to finish typing. */
export const DEBOUNCE_SECONDS = 45

/**
 * A message older than this is not answered: after a restart or an outage,
 * a reply hours late helps less than a person who reads the room.
 */
export const STALE_SECONDS = 60 * 60

/** How many replies the bot writes one merchant in a day. */
export interface BotLimits {
  readonly repliesPerAccount: number
}

export type BotStep =
  | { readonly type: "silent"; readonly reason: BotSilenceReason }
  | { readonly type: "wait"; readonly until: number }
  | { readonly type: "escalate-limit" }
  | { readonly type: "answer" }

export type BotSilenceReason =
  | "empty"
  | "not-merchant"
  | "human-replied"
  | "escalated"
  | "stale"

/**
 * The bot's escalation is the one message of its that mentions people:
 * that is how it reads, after a restart, that it already handed over.
 */
export const isEscalation = (message: BotMessage, bot: string): boolean =>
  message.author === bot && message.text.includes("nostr:npub1")

/**
 * What the bot does next in a merchant's conversation, before any model is
 * asked. It answers only the merchant's latest word, and never once a person
 * from support joined in or it handed over itself.
 */
export const decideStep = ({
  merchant,
  bot,
  messages,
  now,
  limits,
}: {
  readonly merchant: string
  readonly bot: string
  /** Every message of the merchant's room the bot holds. */
  readonly messages: ReadonlyArray<BotMessage>
  /** Unix seconds by the bot's clock. */
  readonly now: number
  readonly limits: BotLimits
}): BotStep => {
  const conversation = currentConversation(messages)
  const last = conversation.at(-1)
  if (last === undefined) return { type: "silent", reason: "empty" }
  if (last.author !== merchant) {
    return { type: "silent", reason: "not-merchant" }
  }
  if (
    conversation.some(
      (message) => message.author !== merchant && message.author !== bot
    )
  ) {
    return { type: "silent", reason: "human-replied" }
  }
  if (conversation.some((message) => isEscalation(message, bot))) {
    return { type: "silent", reason: "escalated" }
  }
  if (now - last.receivedAt > STALE_SECONDS) {
    return { type: "silent", reason: "stale" }
  }
  if (now < last.receivedAt + DEBOUNCE_SECONDS) {
    return { type: "wait", until: last.receivedAt + DEBOUNCE_SECONDS }
  }
  const repliesToday = messages.filter(
    (message) =>
      message.author === bot && message.sentAt > now - LIMIT_WINDOW_SECONDS
  ).length
  if (repliesToday >= limits.repliesPerAccount) {
    return { type: "escalate-limit" }
  }
  return { type: "answer" }
}
