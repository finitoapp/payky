import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type { SupportTeam } from "@/core/integrations/nostr/nostr-support-chat.ts"
import { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

import {
  type BotMessage,
  CONVERSATION_GAP_SECONDS,
  currentConversation,
  DEBOUNCE_SECONDS,
  decideStep,
  decodeBotWrap,
  STALE_SECONDS,
} from "./support-bot-policy.ts"

const botKey = NostrSecretKey(new Uint8Array(generateSecretKey()))
const bot = getPublicKey(botKey)
const humanKey = generateSecretKey()
const human = getPublicKey(humanKey)
const merchantKey = generateSecretKey()
const merchant = getPublicKey(merchantKey)
const stranger = getPublicKey(generateSecretKey())

const team: SupportTeam = {
  pubkeys: [human, bot],
  formerTeams: [[human]],
  relays: ["wss://support.test"],
  indexerRelays: [],
}

const wrapToBot = ({
  from,
  tagged,
  createdAt = 1_000,
  kind = 14,
}: {
  readonly from: Uint8Array
  readonly tagged: ReadonlyArray<string>
  readonly createdAt?: number
  readonly kind?: number
}) =>
  createWrap(
    createSeal(
      createRumor(
        {
          kind,
          created_at: createdAt,
          content: "Hello",
          tags: tagged.map((pubkey) => ["p", pubkey]),
        },
        from
      ),
      from,
      bot
    ),
    bot
  )

const message = (
  author: string,
  sentAt: number,
  text = "Hello"
): BotMessage => ({
  id: `${author}-${sentAt}`,
  author,
  text,
  sentAt,
  receivedAt: sentAt,
  members: [merchant, human, bot],
})

const limits = { repliesPerAccount: 2 }
const now = 10_000

describe("support bot policy", () => {
  test("reads a merchant's message to the team as that merchant's room", () => {
    const decoded = decodeBotWrap({
      wrap: wrapToBot({ from: merchantKey, tagged: [human, bot] }),
      secretKey: botKey,
      team,
      now: 5_000,
      live: true,
    })

    expect(decoded?.merchant).toBe(merchant)
    expect(decoded?.message.members).toEqual([merchant, human, bot])
    expect(decoded?.message.receivedAt).toBe(5_000)
  })

  test("reads a support member's reply as the room of the merchant it went to", () => {
    const decoded = decodeBotWrap({
      wrap: wrapToBot({ from: humanKey, tagged: [merchant, bot] }),
      secretKey: botKey,
      team,
      now: 5_000,
      live: false,
    })

    expect(decoded?.merchant).toBe(merchant)
    expect(decoded?.message.author).toBe(human)
    // From the history, so its own time, not the bot's.
    expect(decoded?.message.receivedAt).toBe(1_000)
  })

  test("ignores a team member's 1:1 with the bot and a room with a stranger", () => {
    const decode = (from: Uint8Array, tagged: ReadonlyArray<string>) =>
      decodeBotWrap({
        wrap: wrapToBot({ from, tagged }),
        secretKey: botKey,
        team,
        now: 5_000,
        live: true,
      })

    expect(decode(humanKey, [bot])).toBeNull()
    expect(decode(merchantKey, [human, bot, stranger])).toBeNull()
  })

  test("reads no reaction as a word in the conversation, its own 👀 included", () => {
    const decode = (from: Uint8Array, tagged: ReadonlyArray<string>) =>
      decodeBotWrap({
        wrap: wrapToBot({ from, tagged, kind: 7 }),
        secretKey: botKey,
        team,
        now: 5_000,
        live: true,
      })

    expect(decode(botKey, [merchant, human])).toBeNull()
    expect(decode(merchantKey, [human, bot])).toBeNull()
  })

  test("starts a new conversation after six hours of silence", () => {
    const old = message(merchant, 1_000)
    const kept = [message(merchant, 1_000 + 5 * 60 * 60), message(bot, 30_000)]
    const recent = [message(merchant, 30_000 + CONVERSATION_GAP_SECONDS)]

    expect(currentConversation([...kept, old])).toEqual([old, ...kept])
    expect(currentConversation([...recent, ...kept, old])).toEqual(recent)
  })

  test("answers the merchant's latest message once they stopped typing", () => {
    const sent = now - DEBOUNCE_SECONDS
    expect(
      decideStep({
        merchant,
        bot,
        messages: [message(merchant, sent)],
        now,
        limits,
      })
    ).toEqual({ type: "answer" })
    expect(
      decideStep({
        merchant,
        bot,
        messages: [message(merchant, sent + 10)],
        now,
        limits,
      })
    ).toEqual({ type: "wait", until: now + 10 })
  })

  test("stays silent once a person from support replied in the conversation", () => {
    expect(
      decideStep({
        merchant,
        bot,
        messages: [
          message(merchant, now - 500),
          message(human, now - 400),
          message(merchant, now - 100),
        ],
        now,
        limits,
      })
    ).toEqual({ type: "silent", reason: "human-replied" })
  })

  test("stays silent after it handed the conversation over", () => {
    expect(
      decideStep({
        merchant,
        bot,
        messages: [
          message(merchant, now - 500),
          message(bot, now - 400, "A colleague will help.\n\nnostr:npub1abc"),
          message(merchant, now - 100),
        ],
        now,
        limits,
      })
    ).toEqual({ type: "silent", reason: "escalated" })
  })

  test("answers again after six hours of quiet since a person replied or it handed over", () => {
    const later = now + CONVERSATION_GAP_SECONDS + 1_000
    const decide = (handover: BotMessage) =>
      decideStep({
        merchant,
        bot,
        messages: [
          message(merchant, now - 500),
          handover,
          message(merchant, later - DEBOUNCE_SECONDS),
        ],
        now: later,
        limits,
      })

    expect(decide(message(human, now - 400))).toEqual({ type: "answer" })
    expect(
      decide(
        message(bot, now - 400, "A colleague will help.\n\nnostr:npub1abc")
      )
    ).toEqual({ type: "answer" })
  })

  test("does not answer a message an hour old", () => {
    expect(
      decideStep({
        merchant,
        bot,
        messages: [message(merchant, now - STALE_SECONDS - 1)],
        now,
        limits,
      })
    ).toEqual({ type: "silent", reason: "stale" })
  })

  test("counts the daily limit across conversations", () => {
    const later = now + CONVERSATION_GAP_SECONDS + 1_000
    expect(
      decideStep({
        merchant,
        bot,
        messages: [
          message(merchant, now - 300),
          message(bot, now - 200),
          message(bot, now - 100),
          message(merchant, later - DEBOUNCE_SECONDS),
        ],
        now: later,
        limits,
      })
    ).toEqual({ type: "escalate-limit" })
  })

  test("hands over once it answered the merchant its daily limit", () => {
    expect(
      decideStep({
        merchant,
        bot,
        messages: [
          message(merchant, now - 500),
          message(bot, now - 400),
          message(merchant, now - 300),
          message(bot, now - 200),
          message(merchant, now - 100),
        ],
        now,
        limits,
      })
    ).toEqual({ type: "escalate-limit" })
  })
})
