import {
  DirectMessageRelaysList,
  GiftWrap,
  Metadata,
  PrivateDirectMessage,
  Reaction,
} from "nostr-tools/kinds"
import { npubEncode } from "nostr-tools/nip19"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { type Event, finalizeEvent, getPublicKey } from "nostr-tools/pure"

import {
  isPublishAccepted,
  type NostrDep,
  publishReasons,
  RELAY_MAX_WAIT_MS,
} from "@/core/integrations/nostr/nostr-client.ts"
import {
  authSigner,
  parseClientTrailer,
  type SupportTeam,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import type { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"
import {
  type AnswerDepth,
  answerConversation,
  type SupportBotModels,
  toModelMessages,
  triageConversation,
} from "@/core/support-bot/support-bot-llm.ts"
import {
  type BotLimits,
  type BotMessage,
  currentConversation,
  decideStep,
  decodeBotWrap,
  LIMIT_WINDOW_SECONDS,
} from "@/core/support-bot/support-bot-policy.ts"
import {
  createRepoTools,
  type SupportBotRepo,
} from "@/core/support-bot/support-bot-repo.ts"

/**
 * The support bot (support/0004): a member of the support team that answers
 * merchants in their NIP-17 support room before a person does. It holds
 * every room's messages in memory, rebuilt from the relays on start, and
 * writes nothing anywhere else.
 */

export const BOT_NAME = "Payky asistent (AI)"

/**
 * Sent when the bot hands over without asking a model: past the merchant's
 * daily limit, or when the model failed. Czech reads for Slovak merchants
 * too, English for the rest.
 */
/** What the bot reacts to a message with while it works on the answer. */
export const WORKING_REACTION = "👀"

export const FALLBACK_ESCALATION =
  "Předávám to kolegům ze supportu, ozvou se vám co nejdřív.\n\nI'm handing this over to my colleagues from support; they will get back to you soon."

export interface SupportBotLimits extends BotLimits {
  /** Code-depth answers one merchant gets in a day. */
  readonly codeRepliesPerAccount: number
  /** Code-depth answers all merchants get in a day, together. */
  readonly codeReplies: number
}

export type SupportBotLogEntry = Readonly<Record<string, unknown>>

export interface SupportBotDeps {
  readonly pool: NostrDep["nostr"]["pool"]
  /** Where the profile is also published, so the app finds the bot's name. */
  readonly appRelays: ReadonlyArray<string>
  readonly secretKey: NostrSecretKey
  readonly team: SupportTeam
  readonly repo: SupportBotRepo
  readonly models: SupportBotModels
  readonly limits: SupportBotLimits
  /** Unix seconds. */
  readonly now: () => number
  /** Runs `callback` after `ms`; returns what cancels it. */
  readonly schedule: (ms: number, callback: () => void) => () => void
  readonly log: (entry: SupportBotLogEntry) => void
}

/** How far back the bot reads: a day of replies plus a wrap's backdating. */
const HISTORY_SECONDS = 3 * 24 * 60 * 60 + 2 * 24 * 60 * 60
const RESUBSCRIBE_MS = 10_000

const unique = (values: ReadonlyArray<string>) => [...new Set(values)]

const mentions = (pubkeys: ReadonlyArray<string>) =>
  pubkeys.map((pubkey) => `nostr:${npubEncode(pubkey)}`).join(" ")

export const createSupportBot = (deps: SupportBotDeps) => {
  const { secretKey, team, log } = deps
  const bot = getPublicKey(secretKey)
  const rooms = new Map<string, Map<string, BotMessage>>()
  const timers = new Map<string, () => void>()
  const busy = new Set<string>()
  const pending = new Set<string>()
  // ponytail: code-depth usage lives in memory, so a restart forgets it;
  // the provider's spend limit stays the hard cap.
  const codeAnswers: Array<{ merchant: string; at: number }> = []

  const messagesOf = (merchant: string): ReadonlyArray<BotMessage> => [
    ...(rooms.get(merchant)?.values() ?? []),
  ]

  const store = (merchant: string, message: BotMessage) => {
    const room = rooms.get(merchant) ?? new Map<string, BotMessage>()
    if (!room.has(message.id)) room.set(message.id, message)
    rooms.set(merchant, room)
  }

  /** Stores a wrap to the bot; the merchant whose room it belongs to. */
  const receive = (wrap: Event, live: boolean): string | null => {
    const decoded = decodeBotWrap({
      wrap,
      secretKey,
      team,
      now: deps.now(),
      live,
    })
    if (decoded === null) return null
    store(decoded.merchant, decoded.message)
    return decoded.merchant
  }

  const publish = async (relays: ReadonlyArray<string>, event: Event) =>
    Promise.allSettled(
      deps.pool.publish([...relays], event, {
        maxWait: RELAY_MAX_WAIT_MS,
        onauth: authSigner(secretKey),
      })
    )

  /**
   * One rumor to the whole room, as Amethyst replies: every member is tagged
   * and gets a copy, so the room stays the same. Every copy goes to the
   * team's relays, where the app and every member read.
   */
  const publishToRoom = async ({
    merchant,
    members,
    kind,
    content,
    tags = [],
  }: {
    readonly merchant: string
    readonly members: ReadonlyArray<string>
    readonly kind: number
    readonly content: string
    readonly tags?: ReadonlyArray<ReadonlyArray<string>>
  }) => {
    const recipients = members.filter((pubkey) => pubkey !== bot)
    const rumor = createRumor(
      {
        kind,
        created_at: deps.now(),
        content,
        tags: [
          ...tags.map((tag) => [...tag]),
          ...recipients.map((pubkey) => ["p", pubkey]),
        ],
      },
      secretKey
    )
    const results = (
      await Promise.all(
        [...recipients, bot].map((pubkey) =>
          publish(
            team.relays,
            createWrap(createSeal(rumor, secretKey, pubkey), pubkey)
          )
        )
      )
    ).flat()
    const accepted = isPublishAccepted(results)
    if (!accepted) {
      log({
        event: "send-failed",
        merchant,
        kind,
        reasons: publishReasons(results),
      })
    }
    return { rumor, accepted }
  }

  const send = async (
    merchant: string,
    members: ReadonlyArray<string>,
    text: string
  ): Promise<boolean> => {
    const { rumor, accepted } = await publishToRoom({
      merchant,
      members,
      kind: PrivateDirectMessage,
      content: text,
    })
    if (!accepted) return false
    store(merchant, {
      id: rumor.id,
      author: bot,
      text,
      sentAt: rumor.created_at,
      receivedAt: rumor.created_at,
      members,
    })
    return true
  }

  /**
   * 👀 on the merchant's message (NIP-25, which NIP-17 carries in a room
   * too): the bot is working on an answer. Not a word in the conversation,
   * so it changes none of the bot's rules.
   */
  const react = (merchant: string, message: BotMessage) =>
    publishToRoom({
      merchant,
      members: message.members,
      kind: Reaction,
      content: WORKING_REACTION,
      tags: [
        ["e", message.id, "", message.author],
        ["k", String(PrivateDirectMessage)],
      ],
    })

  const escalate = (
    merchant: string,
    members: ReadonlyArray<string>,
    text: string
  ) => {
    const people = members.filter(
      (pubkey) => pubkey !== merchant && pubkey !== bot
    )
    return send(merchant, members, `${text}\n\n${mentions(people)}`)
  }

  const codeAllowed = (merchant: string) => {
    const since = deps.now() - LIMIT_WINDOW_SECONDS
    const recent = codeAnswers.filter(({ at }) => at > since)
    return (
      recent.length < deps.limits.codeReplies &&
      recent.filter((answer) => answer.merchant === merchant).length <
        deps.limits.codeRepliesPerAccount
    )
  }

  const answer = async (merchant: string) => {
    const conversation = currentConversation(messagesOf(merchant))
    const last = conversation.at(-1)
    if (last === undefined) return
    const members = last.members
    const client =
      conversation
        .filter((message) => message.author === merchant)
        .map((message) => parseClientTrailer(message.text))
        .findLast((info) => info !== null) ?? null
    const messages = toModelMessages(conversation, bot)

    const triage = await triageConversation({
      model: deps.models.triage,
      messages,
    })
    log({ event: "triage", merchant, ...triage.value, usage: triage.usage })
    if (triage.value.action === "ignore") return
    if (triage.value.action === "escalate") {
      await escalate(
        merchant,
        members,
        triage.value.escalationMessage.trim() || FALLBACK_ESCALATION
      )
      return
    }

    await react(merchant, last)
    const depth: AnswerDepth =
      triage.value.depth === "code" && codeAllowed(merchant) ? "code" : "docs"
    const docs = await deps.repo.docs()
    const code =
      depth === "code"
        ? await (async () => {
            const { revision, exact } = await deps.repo.resolveRevision(
              client?.version ?? null
            )
            return {
              agentsGuide: await deps.repo.agentsGuide(revision),
              exact,
              tools: createRepoTools(deps.repo, revision),
            }
          })()
        : undefined
    const reply = await answerConversation({
      model: depth === "code" ? deps.models.code : deps.models.docs,
      messages,
      docs,
      client,
      code,
    })
    log({
      event: "answer",
      merchant,
      depth,
      escalate: reply.value.escalate,
      usage: reply.usage,
    })
    if (depth === "code") codeAnswers.push({ merchant, at: deps.now() })

    // The merchant wrote again while the model was thinking: answer all of
    // it instead.
    if (currentConversation(messagesOf(merchant)).at(-1)?.id !== last.id) {
      pending.add(merchant)
      return
    }
    await (reply.value.escalate
      ? escalate(merchant, members, reply.value.message)
      : send(merchant, members, reply.value.message))
  }

  const evaluate = async (merchant: string): Promise<void> => {
    if (busy.has(merchant)) {
      pending.add(merchant)
      return
    }
    timers.get(merchant)?.()
    timers.delete(merchant)

    const now = deps.now()
    const step = decideStep({
      merchant,
      bot,
      messages: messagesOf(merchant),
      now,
      limits: deps.limits,
    })
    if (step.type === "wait") {
      timers.set(
        merchant,
        deps.schedule((step.until - now) * 1000, () => void evaluate(merchant))
      )
      return
    }
    if (step.type === "silent") {
      if (step.reason !== "not-merchant" && step.reason !== "empty") {
        log({ event: "silent", merchant, reason: step.reason })
      }
      return
    }

    busy.add(merchant)
    try {
      const members =
        currentConversation(messagesOf(merchant)).at(-1)?.members ?? []
      if (step.type === "escalate-limit") {
        log({ event: "limit", merchant })
        await escalate(merchant, members, FALLBACK_ESCALATION)
        return
      }
      try {
        await answer(merchant)
      } catch (error) {
        log({ event: "error", merchant, error: String(error) })
        await escalate(merchant, members, FALLBACK_ESCALATION)
      }
    } finally {
      busy.delete(merchant)
      if (pending.delete(merchant)) await evaluate(merchant)
    }
  }

  /** The bot's name, and its DM relays: where Amethyst sends it replies. */
  const publishIdentity = async () => {
    const now = deps.now()
    const relays = unique([
      ...team.relays,
      ...team.indexerRelays,
      ...deps.appRelays,
    ])
    const profile = finalizeEvent(
      {
        kind: Metadata,
        created_at: now,
        tags: [],
        content: JSON.stringify({ name: BOT_NAME, display_name: BOT_NAME }),
      },
      secretKey
    )
    const dmRelays = finalizeEvent(
      {
        kind: DirectMessageRelaysList,
        created_at: now,
        tags: team.relays.map((relay) => ["relay", relay]),
        content: "",
      },
      secretKey
    )
    for (const [event, name] of [
      [profile, "profile"],
      [dmRelays, "dm-relays"],
    ] as const) {
      const results = await publish(relays, event)
      if (!isPublishAccepted(results)) {
        log({ event: "publish-failed", name, reasons: publishReasons(results) })
      }
    }
  }

  /**
   * Reads the stored wraps, then listens. What the relays hold arrives
   * before their end-of-stored-events and counts as history; anything
   * later arrived live. The pool does not resubscribe a dropped
   * subscription, so the bot does, and the replayed history is deduplicated
   * by rumor id.
   */
  const listen = () => {
    let stored = true
    let stopped = false
    const subscription = deps.pool.subscribeMany(
      [...team.relays],
      {
        kinds: [GiftWrap],
        "#p": [bot],
        since: deps.now() - HISTORY_SECONDS,
      },
      {
        onevent: (wrap) => {
          const merchant = receive(wrap, !stored)
          if (merchant !== null && !stored) void evaluate(merchant)
        },
        oneose: () => {
          stored = false
          log({ event: "listening", rooms: rooms.size })
          for (const merchant of rooms.keys()) void evaluate(merchant)
        },
        onclose: (reasons) => {
          if (stopped) return
          log({ event: "subscription-closed", reasons })
          cancelResubscribe = deps.schedule(RESUBSCRIBE_MS, () => {
            stopListening = listen()
          })
        },
        onauth: authSigner(secretKey),
      }
    )
    return () => {
      stopped = true
      subscription.close()
    }
  }

  let stopListening = () => {}
  let cancelResubscribe = () => {}

  return {
    start: async () => {
      await publishIdentity()
      stopListening = listen()
    },
    stop: () => {
      stopListening()
      cancelResubscribe()
      for (const cancel of timers.values()) cancel()
      timers.clear()
    },
    /** Decides on a merchant's room now; the bot calls it on every message. */
    evaluate,
  }
}
