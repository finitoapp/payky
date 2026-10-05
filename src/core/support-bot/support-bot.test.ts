import { MockLanguageModelV4 } from "ai/test"
import type { SubscribeManyParams } from "nostr-tools/abstract-pool"
import { npubEncode } from "nostr-tools/nip19"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import { type Event, generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type { NostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import {
  appendClientTrailer,
  type SupportTeam,
  unwrapVerifiedRumor,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

import {
  createSupportBot,
  FALLBACK_ESCALATION,
  type SupportBotLogEntry,
} from "./support-bot.ts"
import type { SupportBotModels } from "./support-bot-llm.ts"
import type { SupportBotRepo } from "./support-bot-repo.ts"

const botKey = NostrSecretKey(new Uint8Array(generateSecretKey()))
const bot = getPublicKey(botKey)
const humanKey = generateSecretKey()
const human = getPublicKey(humanKey)
const merchantKey = NostrSecretKey(new Uint8Array(generateSecretKey()))
const merchant = getPublicKey(merchantKey)
const supportRelay = "wss://support.test"

const team: SupportTeam = {
  pubkeys: [human, bot],
  formerTeams: [],
  relays: [supportRelay],
  indexerRelays: [],
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

/** A model that answers every call with `value` as its structured output. */
const modelAnswering = (value: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(value) }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  })

const failingModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("overloaded")
    },
  })

const triageTo = (
  action: "ignore" | "answer" | "escalate",
  depth: "docs" | "code" = "docs",
  escalationMessage = ""
) => modelAnswering({ action, depth, escalationMessage })

const reply = (message: string, escalate = false) =>
  modelAnswering({ message, escalate })

const fakeRepo = () => {
  const resolved: Array<string | null> = []
  const repo: SupportBotRepo = {
    sync: async () => undefined,
    docs: async () => [{ path: "docs/fees.md", content: "Cash has no fee." }],
    agentsGuide: async () => "# Agents",
    resolveRevision: async (version) => {
      resolved.push(version)
      return { revision: version ?? "origin/HEAD", exact: version !== null }
    },
    listFiles: async () => "",
    readFile: async () => "",
    searchCode: async () => "",
  }
  return { repo, resolved }
}

const startBot = async ({
  models,
  limits = {},
}: {
  readonly models: Partial<SupportBotModels>
  readonly limits?: Partial<{ repliesPerAccount: number }>
}) => {
  let now = 1_000
  const published: Event[] = []
  const logs: SupportBotLogEntry[] = []
  let params: SubscribeManyParams | undefined
  const pool: NostrDep["nostr"]["pool"] = {
    get: async () => null,
    publish: (relays, event) => {
      published.push(event)
      return relays.map(async () => "ok")
    },
    listConnectionStatus: () => new Map(),
    subscribeMany: (_relays, _filter, subscribeParams) => {
      params = subscribeParams
      return { close: () => undefined }
    },
    subscribeManyEose: () => ({ close: () => undefined }),
  }
  const { repo, resolved } = fakeRepo()
  const supportBot = createSupportBot({
    pool,
    appRelays: [],
    secretKey: botKey,
    team,
    repo,
    models: {
      triage: models.triage ?? triageTo("answer"),
      docs: models.docs ?? reply("Cash has no fee."),
      code: models.code ?? reply("The code says so."),
    },
    limits: {
      repliesPerAccount: limits.repliesPerAccount ?? 10,
      codeRepliesPerAccount: 3,
      codeReplies: 30,
    },
    now: () => now,
    schedule: () => () => undefined,
    log: (entry) => logs.push(entry),
  })
  await supportBot.start()

  return {
    published,
    logs,
    resolved,
    /** The relays' stored wraps, then their end-of-stored-events. */
    replay: (wraps: ReadonlyArray<Event>) => {
      for (const wrap of wraps) params?.onevent?.(wrap)
      params?.oneose?.()
    },
    /** A live message, then the moment the debounce has passed. */
    deliver: async (wrap: Event) => {
      params?.onevent?.(wrap)
      now += 45
      await supportBot.evaluate(merchant)
    },
    /** What the bot sent, as the merchant reads it. */
    sentToMerchant: () => readByMerchant(published, 14),
    /** The reactions the merchant got. */
    reactionsToMerchant: () => readByMerchant(published, 7),
    advance: (seconds: number) => {
      now += seconds
    },
    now: () => now,
  }
}

/** The rumors of `kind` the bot published, as the merchant reads them. */
const readByMerchant = (published: ReadonlyArray<Event>, kind: number) =>
  published.flatMap((event) => {
    const rumor = unwrapVerifiedRumor({ wrap: event, secretKey: merchantKey })
    return rumor?.kind === kind ? [rumor] : []
  })

const fromMerchant = (text: string, createdAt: number) =>
  createWrap(
    createSeal(
      createRumor(
        {
          kind: 14,
          created_at: createdAt,
          content: appendClientTrailer(text, {
            version: "abc1234",
            platform: "android",
          }),
          tags: [
            ["p", human],
            ["p", bot],
          ],
        },
        merchantKey
      ),
      merchantKey,
      bot
    ),
    bot
  )

const fromHuman = (text: string, createdAt: number) =>
  createWrap(
    createSeal(
      createRumor(
        {
          kind: 14,
          created_at: createdAt,
          content: text,
          tags: [
            ["p", merchant],
            ["p", bot],
          ],
        },
        humanKey
      ),
      humanKey,
      bot
    ),
    bot
  )

describe("support bot", () => {
  test("answers a merchant's question to the whole room once they stopped typing", async () => {
    const docs = reply("Cash has no fee.")
    const chat = await startBot({ models: { docs } })
    chat.replay([])

    await chat.deliver(fromMerchant("Is there a fee for cash?", chat.now()))

    const [answer] = chat.sentToMerchant()
    expect(answer?.content).toBe("Cash has no fee.")
    expect(answer?.pubkey).toBe(bot)
    expect(answer?.tags).toEqual([
      ["p", merchant],
      ["p", human],
    ])
    // The merchant reads the documentation's answer, without the trailer.
    const [call] = docs.doGenerateCalls
    expect(JSON.stringify(call?.prompt)).toContain("Cash has no fee.")
    expect(JSON.stringify(call?.prompt)).toContain("Payky abc1234 on android")
    expect(JSON.stringify(call?.prompt)).not.toContain("— Payky")
    // One wrap for each of the room's members, the bot's own included, for
    // the answer and for the reaction before it.
    expect(chat.published.filter((event) => event.kind === 1059)).toHaveLength(
      6
    )
  })

  test("hands over by mentioning the people from support, then stays silent", async () => {
    const triage = triageTo("escalate", "docs", "Kolega se vám ozve.")
    const chat = await startBot({ models: { triage } })
    chat.replay([])

    await chat.deliver(fromMerchant("Chci vrátit peníze", chat.now()))
    chat.advance(60)
    await chat.deliver(fromMerchant("Haló?", chat.now()))

    const sent = chat.sentToMerchant()
    expect(sent.map((rumor) => rumor.content)).toEqual([
      `Kolega se vám ozve.\n\nnostr:${npubEncode(human)}`,
    ])
    expect(triage.doGenerateCalls).toHaveLength(1)
  })

  test("stays silent once a person from support replied", async () => {
    const triage = triageTo("answer")
    const chat = await startBot({ models: { triage } })
    chat.replay([])

    await chat.deliver(fromMerchant("Hello", chat.now() - 10))
    const answered = chat.sentToMerchant().length
    await chat.deliver(fromHuman("I'm on it", chat.now()))
    await chat.deliver(fromMerchant("Thanks, and one more thing", chat.now()))

    expect(chat.sentToMerchant()).toHaveLength(answered)
    expect(triage.doGenerateCalls).toHaveLength(1)
  })

  test("does not answer what it finds in the relays' history from hours ago", async () => {
    const triage = triageTo("answer")
    const chat = await startBot({ models: { triage } })
    chat.advance(10_000)

    chat.replay([fromMerchant("Old question", 1_000)])
    await Promise.resolve()

    expect(triage.doGenerateCalls).toHaveLength(0)
    expect(chat.sentToMerchant()).toEqual([])
  })

  test("reads the code at the commit the merchant's app was built from", async () => {
    const code = reply("The code says so.")
    const chat = await startBot({
      models: { triage: triageTo("answer", "code"), code },
    })
    chat.replay([])

    await chat.deliver(fromMerchant("Why is the total rounded?", chat.now()))

    expect(chat.resolved).toEqual(["abc1234"])
    expect(code.doGenerateCalls[0]?.tools?.map((tool) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "search_code",
    ])
    expect(chat.sentToMerchant()[0]?.content).toBe("The code says so.")
  })

  test("reacts with 👀 to the merchant's message while it works on the answer", async () => {
    const chat = await startBot({ models: {} })
    chat.replay([])

    const question = fromMerchant("Is there a fee for cash?", chat.now())
    await chat.deliver(question)

    const [reaction] = chat.reactionsToMerchant()
    const [answer] = chat.sentToMerchant()
    const questionId = unwrapVerifiedRumor({
      wrap: question,
      secretKey: botKey,
    })?.id
    expect(reaction?.content).toBe("👀")
    expect(reaction?.tags).toEqual([
      ["e", questionId, "", merchant],
      ["k", "14"],
      ["p", merchant],
      ["p", human],
    ])
    expect(reaction?.created_at).toBeLessThanOrEqual(answer?.created_at ?? 0)
    expect(chat.reactionsToMerchant()).toHaveLength(1)
  })

  test("ignores a message with nothing to answer", async () => {
    const chat = await startBot({ models: { triage: triageTo("ignore") } })
    chat.replay([])

    await chat.deliver(fromMerchant("Thanks!", chat.now()))

    expect(chat.sentToMerchant()).toEqual([])
    expect(chat.reactionsToMerchant()).toEqual([])
  })

  test("hands over without a model past the daily limit or when the model fails", async () => {
    const limited = await startBot({
      models: {},
      limits: { repliesPerAccount: 1 },
    })
    limited.replay([])
    await limited.deliver(fromMerchant("One", limited.now()))
    limited.advance(60)
    await limited.deliver(fromMerchant("Two", limited.now()))

    const failing = await startBot({ models: { triage: failingModel() } })
    failing.replay([])
    await failing.deliver(fromMerchant("Hello", failing.now()))

    const handover = `${FALLBACK_ESCALATION}\n\nnostr:${npubEncode(human)}`
    expect(limited.sentToMerchant().map((rumor) => rumor.content)).toEqual([
      "Cash has no fee.",
      handover,
    ])
    expect(failing.sentToMerchant().map((rumor) => rumor.content)).toEqual([
      handover,
    ])
  })
})
