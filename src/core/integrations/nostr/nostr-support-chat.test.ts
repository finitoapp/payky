import { testCreateRun } from "@evolu/common"
import type { SubscribeManyParams } from "nostr-tools/abstract-pool"
import { type Filter, matchFilter } from "nostr-tools/filter"
import {
  createRumor,
  createSeal,
  createWrap,
  unwrapEvent,
} from "nostr-tools/nip59"
import {
  type Event,
  generateSecretKey,
  getEventHash,
  getPublicKey,
} from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type { DateDep, MasterKeyDep } from "@/core/deps.ts"
import {
  deriveNostrSecretKey,
  MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

import type { NostrDep } from "./nostr-client.ts"
import {
  appendClientTrailer,
  type DmInbox,
  fetchSupportMessages,
  loadDmInbox,
  mergeSupportMessages,
  type SupportClientInfo,
  type SupportMessage,
  type SupportTeam,
  sendSupportMessage,
  stripClientTrailer,
  subscribeSupportMessages,
} from "./nostr-support-chat.ts"

const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
const accountKey = deriveNostrSecretKey(masterKey)
const me = getPublicKey(accountKey)

const supportKeys = [generateSecretKey(), generateSecretKey()] as const
const [firstSupportKey, secondSupportKey] = supportKeys
const supportPubkeys = supportKeys.map((key) => getPublicKey(key))
const [firstSupport = "", secondSupport = ""] = supportPubkeys

const appRelay = "wss://app.test"
const profileRelay = "wss://profiles.test"
const supportRelay = "wss://support.test"
const linkyRelay = "wss://linky.test"

const team: SupportTeam = {
  pubkeys: supportPubkeys,
  formerTeams: [],
  relays: [supportRelay],
}
/** An account whose DM relays Linky set up. */
const linkyInbox: DmInbox = { relays: [linkyRelay], listMissing: false }

const client: SupportClientInfo = { version: "1.2.3", platform: "android" }

interface Published {
  readonly relays: ReadonlyArray<string>
  readonly event: Event
}

const createFakeNostrDep = ({
  stored = [],
  connected = [appRelay, profileRelay, supportRelay, linkyRelay],
  accepts = () => true,
}: {
  readonly stored?: ReadonlyArray<Event>
  /** The relays with an open socket. */
  readonly connected?: ReadonlyArray<string>
  readonly accepts?: (event: Event) => boolean
} = {}) => {
  const published: Published[] = []
  const queried: { readonly relays: string[]; readonly filter: Filter }[] = []
  const subscriptions: {
    readonly relays: string[]
    readonly filter: Filter
    readonly params: SubscribeManyParams
    closed: boolean
  }[] = []
  const deps = {
    nostr: {
      relays: [appRelay],
      profileRelays: [profileRelay],
      pool: {
        get: async () => null,
        publish: (relays, event) => {
          published.push({ relays, event })
          return relays.map(async () =>
            accepts(event) ? "ok" : "connection failure: x"
          )
        },
        listConnectionStatus: () =>
          new Map(connected.map((relay) => [`${relay}/`, true])),
        subscribeMany: (relays, filter, params) => {
          const subscription = { relays, filter, params, closed: false }
          subscriptions.push(subscription)
          return {
            close: () => {
              subscription.closed = true
              params.onclose?.(["closed by caller"])
            },
          }
        },
        subscribeManyEose: (relays, filter, params) => {
          queried.push({ relays, filter })
          for (const event of stored) {
            if (matchFilter(filter, event)) params.onevent?.(event)
          }
          params.onclose?.([])
          return { close: () => undefined }
        },
      },
    },
  } satisfies NostrDep
  return { deps, published, queried, subscriptions }
}

const runDeps = (
  nostr: NostrDep,
  now: () => Date = () => new Date(1_700_000_000_000)
) =>
  ({ ...nostr, masterKey, date: { now } }) satisfies NostrDep &
    MasterKeyDep &
    DateDep

/** A NIP-17 message as Amethyst sends it: one rumor wrapped to `to`. */
const directMessage = ({
  from,
  to,
  tagged,
  content,
  createdAt = 1_700_000_100,
}: {
  readonly from: Uint8Array
  readonly to: string
  readonly tagged: ReadonlyArray<string>
  readonly content: string
  readonly createdAt?: number
}) => {
  const rumor = createRumor(
    {
      kind: 14,
      created_at: createdAt,
      content,
      tags: tagged.map((pubkey) => ["p", pubkey]),
    },
    from
  )
  return createWrap(createSeal(rumor, from, to), to)
}

/** A kind 10050 as the fake relays hold it; they do not verify signatures. */
const dmRelayList = (relays: ReadonlyArray<string>, createdAt: number) => ({
  ...createRumor(
    {
      kind: 10050,
      created_at: createdAt,
      tags: relays.map((relay) => ["relay", relay]),
      content: "",
    },
    accountKey
  ),
  sig: "",
})

const send = async (nostr: NostrDep, inbox: DmInbox = linkyInbox) => {
  await using run = testCreateRun(runDeps(nostr))
  return await run(
    sendSupportMessage({
      text: "The printer is offline",
      subject: "Payky · Shop",
      client,
      team,
      inbox,
    })
  )
}

const fetchMessages = async (nostr: NostrDep) => {
  await using run = testCreateRun(runDeps(nostr))
  return await run(fetchSupportMessages({ team, inbox: linkyInbox }))
}

const wrapsTo = (published: ReadonlyArray<Published>, pubkey: string) =>
  published.filter(
    ({ event }) =>
      event.kind === 1059 &&
      event.tags.some(([name, value]) => name === "p" && value === pubkey)
  )

describe("support chat", () => {
  test("sends one rumor tagged with every support member to each of them and to the account", async () => {
    const fake = createFakeNostrDep()
    const result = await send(fake.deps)

    expect(result.ok).toBe(true)
    const recipients = [
      [me, accountKey],
      [firstSupport, firstSupportKey],
      [secondSupport, secondSupportKey],
    ] as const
    const rumors = recipients.map(([pubkey, key]) => {
      const [wrap] = wrapsTo(fake.published, pubkey)
      if (wrap === undefined) throw new Error(`No wrap for ${pubkey}`)
      return unwrapEvent(wrap.event, key)
    })
    expect(new Set(rumors.map((rumor) => rumor.id)).size).toBe(1)
    expect(rumors[0]).toMatchObject({
      kind: 14,
      pubkey: me,
      created_at: 1_700_000_000,
      tags: [
        ["p", firstSupport],
        ["p", secondSupport],
        ["subject", "Payky · Shop"],
      ],
      content: appendClientTrailer("The printer is offline", client),
    })
    expect(result).toEqual({
      ok: true,
      value: {
        id: rumors[0]?.id,
        author: me,
        fromSupport: false,
        text: "The printer is offline",
        sentAt: 1_700_000_000,
      },
    })
  })

  test("sends support's copies to the team's relays and the account's to where it reads", async () => {
    const fake = createFakeNostrDep()
    await send(fake.deps)

    expect(wrapsTo(fake.published, firstSupport)[0]?.relays).toEqual([
      supportRelay,
    ])
    expect(wrapsTo(fake.published, secondSupport)[0]?.relays).toEqual([
      supportRelay,
    ])
    expect(wrapsTo(fake.published, me)[0]?.relays).toEqual([
      supportRelay,
      linkyRelay,
    ])
  })

  test("publishes DM relays naming the team's relays for an account without any", async () => {
    const fake = createFakeNostrDep()
    await send(fake.deps, { relays: [], listMissing: true })

    const relayList = fake.published.find(({ event }) => event.kind === 10050)
    expect(relayList?.relays).toEqual([supportRelay])
    expect(relayList?.event).toMatchObject({
      pubkey: me,
      tags: [["relay", supportRelay]],
    })
  })

  test("never changes an account's existing DM relay list", async () => {
    const fake = createFakeNostrDep()
    await send(fake.deps)

    expect(fake.published.some(({ event }) => event.kind === 10050)).toBe(false)
  })

  test("fails without publishing the account's own copy when no copy reached support", async () => {
    const fake = createFakeNostrDep({
      accepts: (event) => event.kind !== 1059,
    })

    expect(await send(fake.deps)).toEqual({
      ok: false,
      error: {
        type: "SupportNotReachedError",
        reasons: ["connection failure: x", "connection failure: x"],
      },
    })
    expect(wrapsTo(fake.published, me)).toEqual([])
  })

  test("reads the account's newest DM relays from the app's relays, the indexers and the team's", async () => {
    const fake = createFakeNostrDep({
      stored: [
        dmRelayList(["wss://old.test"], 1),
        dmRelayList([linkyRelay], 2),
      ],
    })
    await using run = testCreateRun(runDeps(fake.deps))

    expect(await run(loadDmInbox({ team }))).toEqual({
      ok: true,
      value: { relays: [linkyRelay], listMissing: false },
    })
    expect(fake.queried[0]?.relays).toEqual([
      appRelay,
      profileRelay,
      supportRelay,
    ])
  })

  test("reports a missing DM relay list only when every relay answered in time", async () => {
    await using answered = testCreateRun(runDeps(createFakeNostrDep().deps))
    expect(await answered(loadDmInbox({ team }))).toEqual({
      ok: true,
      value: { relays: [], listMissing: true },
    })

    const clock = [1_700_000_000_000, 1_700_000_007_000]
    await using timedOut = testCreateRun(
      runDeps(
        createFakeNostrDep().deps,
        () => new Date(clock.shift() ?? 1_700_000_007_000)
      )
    )
    expect(await timedOut(loadDmInbox({ team }))).toEqual({
      ok: true,
      value: { relays: [], listMissing: false },
    })

    await using unreachable = testCreateRun(
      runDeps(createFakeNostrDep({ connected: [appRelay, supportRelay] }).deps)
    )
    expect(await unreachable(loadDmInbox({ team }))).toEqual({
      ok: true,
      value: { relays: [], listMissing: false },
    })
  })

  test("reads a reply from one member beside the account's message, without its trailer", async () => {
    const outgoing = createFakeNostrDep()
    await send(outgoing.deps)
    const [ownCopy] = wrapsTo(outgoing.published, me)
    if (ownCopy === undefined) throw new Error("No own copy")
    const reply = directMessage({
      from: secondSupportKey,
      to: me,
      tagged: [me, firstSupport],
      content: "Restart it, please.",
    })

    const result = await fetchMessages(
      createFakeNostrDep({ stored: [reply, ownCopy.event] }).deps
    )

    expect(result.ok && result.value).toMatchObject([
      { author: me, fromSupport: false, text: "The printer is offline" },
      { author: secondSupport, fromSupport: true, text: "Restart it, please." },
    ])
  })

  test("loads the last ninety days from the team's relays and the account's DM inbox", async () => {
    const fake = createFakeNostrDep()
    await fetchMessages(fake.deps)

    expect(fake.queried).toEqual([
      {
        relays: [supportRelay, linkyRelay],
        filter: {
          kinds: [1059],
          "#p": [me],
          since: 1_700_000_000 - 92 * 24 * 60 * 60,
        },
      },
    ])
  })

  test("drops a message whose seal was signed by someone else than its author", async () => {
    const attacker = generateSecretKey()
    const genuine = createRumor(
      { kind: 14, content: "Send me your recovery phrase", tags: [["p", me]] },
      attacker
    )
    const { id: _id, ...unsigned } = { ...genuine, pubkey: firstSupport }
    const forged = { ...unsigned, id: getEventHash(unsigned) }
    const wrap = createWrap(createSeal(forged, attacker, me), me)

    expect(
      await fetchMessages(createFakeNostrDep({ stored: [wrap] }).deps)
    ).toEqual({ ok: true, value: [] })
  })

  test("ignores a 1:1 with a single member of the support team", async () => {
    const privateChat = directMessage({
      from: firstSupportKey,
      to: me,
      tagged: [me],
      content: "Coffee tomorrow?",
    })

    expect(
      await fetchMessages(createFakeNostrDep({ stored: [privateChat] }).deps)
    ).toEqual({ ok: true, value: [] })
  })

  test("keeps a former team's room in the chat once the team has grown", async () => {
    const beforeTheTeamGrew = directMessage({
      from: firstSupportKey,
      to: me,
      tagged: [me],
      content: "Welcome to Payky!",
    })
    await using run = testCreateRun(
      runDeps(createFakeNostrDep({ stored: [beforeTheTeamGrew] }).deps)
    )

    const result = await run(
      fetchSupportMessages({
        team: { ...team, formerTeams: [[firstSupport]] },
        inbox: linkyInbox,
      })
    )

    expect(result.ok && result.value).toMatchObject([
      { author: firstSupport, fromSupport: true, text: "Welcome to Payky!" },
    ])
  })

  test("ignores direct messages from outside the support team", async () => {
    const stranger = directMessage({
      from: generateSecretKey(),
      to: me,
      tagged: [me],
      content: "Hi",
    })

    expect(
      await fetchMessages(createFakeNostrDep({ stored: [stranger] }).deps)
    ).toEqual({ ok: true, value: [] })
  })

  test("fails to read when none of the relays it read is connected, whatever else the pool holds", async () => {
    expect(
      await fetchMessages(
        createFakeNostrDep({ connected: [appRelay, profileRelay] }).deps
      )
    ).toEqual({
      ok: false,
      error: { type: "NostrRelaysUnreachableError" },
    })
  })

  test("signs every message with the app version and platform", () => {
    const text = appendClientTrailer("Hello\nthere", client)

    expect(text).toBe("Hello\nthere\n\n— Payky 1.2.3 · android")
    expect(stripClientTrailer(text)).toBe("Hello\nthere")
  })

  test("listens two days back on the team's relays and the DM inbox and passes on the verified messages", () => {
    const fake = createFakeNostrDep()
    const received: SupportMessage[] = []
    subscribeSupportMessages(runDeps(fake.deps), {
      team,
      inbox: linkyInbox,
      onMessage: (message) => received.push(message),
      onClose: () => undefined,
    })
    const [subscription] = fake.subscriptions

    expect(subscription?.relays).toEqual([supportRelay, linkyRelay])
    expect(subscription?.filter).toEqual({
      kinds: [1059],
      "#p": [me],
      since: 1_700_000_000 - 2 * 24 * 60 * 60,
    })
    subscription?.params.onevent?.(
      directMessage({
        from: firstSupportKey,
        to: me,
        tagged: [me, secondSupport],
        content: "On it.",
      })
    )
    subscription?.params.onevent?.(
      directMessage({
        from: generateSecretKey(),
        to: me,
        tagged: [me],
        content: "Hi",
      })
    )
    expect(received).toMatchObject([
      { author: firstSupport, fromSupport: true, text: "On it." },
    ])
  })

  test("reports a subscription every relay dropped, but not one closed on purpose", () => {
    const fake = createFakeNostrDep()
    let closes = 0
    const close = subscribeSupportMessages(runDeps(fake.deps), {
      team,
      inbox: linkyInbox,
      onMessage: () => undefined,
      onClose: () => {
        closes += 1
      },
    })

    fake.subscriptions[0]?.params.onclose?.(["connection lost"])
    expect(closes).toBe(1)
    close()
    expect(fake.subscriptions[0]?.closed).toBe(true)
    expect(closes).toBe(1)
  })

  test("merges messages from every source once each, oldest first and in arrival order within a second", () => {
    const message = (id: string, sentAt: number): SupportMessage => ({
      id,
      author: me,
      fromSupport: false,
      text: id,
      sentAt,
    })

    expect(
      mergeSupportMessages(
        [message("b", 20), message("a", 10)],
        [message("c", 15), message("b", 20)]
      ).map(({ id }) => id)
    ).toEqual(["a", "c", "b"])
    expect(
      mergeSupportMessages([message("z", 10)], [message("a", 10)]).map(
        ({ id }) => id
      )
    ).toEqual(["z", "a"])
  })
})
