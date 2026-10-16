import { testCreateRun } from "@evolu/common"
import { type Event, getPublicKey, verifyEvent } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import type { DateDep, MasterKeyDep } from "../../deps.ts"
import {
  deriveNostrSecretKey,
  MasterKey,
} from "../../modules/shared/key-derivation.ts"

import { NonEmptyString255 } from "../../modules/shared/schema.ts"

import {
  emptyNostrProfile,
  fetchNostrProfile,
  getNostrIdentity,
  mergeProfileMetadata,
  type NostrDep,
  parseProfileMetadata,
  publishNostrProfile,
  publishNostrProfileName,
} from "./nostr-client.ts"

const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
const pubkey = getPublicKey(deriveNostrSecretKey(masterKey))

const createFakeNostrDep = ({
  stored = null,
  connected = true,
  publishResults = ["ok"],
}: {
  readonly stored?: Event | null
  readonly connected?: boolean
  readonly publishResults?: ReadonlyArray<string | Error>
} = {}) => {
  const published: Event[] = []
  const queried: (readonly string[])[] = []
  const publishedTo: (readonly string[])[] = []
  const deps = {
    nostr: {
      relays: ["wss://relay.test"],
      pool: {
        get: async (relays) => {
          queried.push(relays)
          return stored
        },
        publish: (relays, event) => {
          published.push(event)
          publishedTo.push(relays)
          return publishResults.map((result) =>
            result instanceof Error
              ? Promise.reject(result)
              : Promise.resolve(result)
          )
        },
        listConnectionStatus: () => new Map([["wss://relay.test/", connected]]),
        subscribeMany: () => ({ close: () => undefined }),
        subscribeManyEose: () => ({ close: () => undefined }),
      },
    },
  } satisfies NostrDep
  return { deps, published, queried, publishedTo }
}

const profileEvent = (content: string) => ({ content }) as Event

describe("nostr client", () => {
  test("derives the npub from the account's NIP-06 key", () => {
    expect(getNostrIdentity(masterKey)).toEqual({
      pubkey,
      npub: expect.stringMatching(/^npub1/u),
    })
  })

  test("reads display_name before name and drops undisplayable pictures", () => {
    expect(
      parseProfileMetadata(
        JSON.stringify({
          name: "shop",
          display_name: " Shop ",
          picture: "javascript:alert(1)",
          lud16: "shop@example.com",
        })
      )
    ).toEqual({
      name: "Shop",
      picture: null,
      metadata: {
        name: "shop",
        display_name: " Shop ",
        picture: "javascript:alert(1)",
        lud16: "shop@example.com",
      },
    })
    expect(parseProfileMetadata("not json")).toBeNull()
  })

  test("an edit keeps every other field and clears a removed name", () => {
    const current = {
      name: "old",
      display_name: "old",
      picture: "https://example.com/a.png",
      lud16: "shop@example.com",
    }
    expect(
      mergeProfileMetadata({ current, name: " New ", picture: null })
    ).toEqual({ name: "New", display_name: "New", lud16: "shop@example.com" })
    expect(
      mergeProfileMetadata({ current, name: "", picture: "data:image/jpeg,x" })
    ).toEqual({ picture: "data:image/jpeg,x", lud16: "shop@example.com" })
  })

  test("returns the stored profile, or the empty one when none is stored", async () => {
    const stored = createFakeNostrDep({
      stored: profileEvent(JSON.stringify({ name: "Shop" })),
    })
    await using run = testCreateRun(stored.deps)
    const result = await run(fetchNostrProfile({ pubkey }))
    expect(result.ok && result.value.name).toBe("Shop")

    await using emptyRun = testCreateRun(createFakeNostrDep().deps)
    expect(await emptyRun(fetchNostrProfile({ pubkey }))).toEqual({
      ok: true,
      value: emptyNostrProfile,
    })
  })

  test("reads a profile from extra relays too but publishes only to the app's relays", async () => {
    const fake = createFakeNostrDep()
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date() },
    })

    await run(
      fetchNostrProfile({ pubkey, extraRelays: ["wss://profiles.test"] })
    )
    await run(publishNostrProfile({ metadata: { name: "Shop" } }))

    expect(fake.queried).toEqual([["wss://relay.test", "wss://profiles.test"]])
    expect(fake.publishedTo).toEqual([["wss://relay.test"]])
  })

  test("fails instead of reporting an empty profile when no relay answered", async () => {
    await using run = testCreateRun(
      createFakeNostrDep({ connected: false }).deps
    )
    expect(await run(fetchNostrProfile({ pubkey }))).toEqual({
      ok: false,
      error: { type: "NostrRelaysUnreachableError" },
    })
  })

  test("publishes a kind-0 event signed with the account's key", async () => {
    const fake = createFakeNostrDep({
      publishResults: ["connection failure: x", "ok"],
    })
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date(1_700_000_000_000) },
    } satisfies NostrDep & MasterKeyDep & DateDep)

    const result = await run(
      publishNostrProfile({ metadata: { name: "Shop" } })
    )

    expect(result.ok).toBe(true)
    const [event] = fake.published
    expect(event).toMatchObject({
      kind: 0,
      pubkey,
      created_at: 1_700_000_000,
      content: JSON.stringify({ name: "Shop" }),
    })
    expect(event && verifyEvent(event)).toBe(true)
  })

  test("fails when no relay accepted the profile", async () => {
    const fake = createFakeNostrDep({
      publishResults: ["connection failure: x", new Error("blocked")],
    })
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date() },
    })

    expect(
      await run(publishNostrProfile({ metadata: { name: "Shop" } }))
    ).toEqual({
      ok: false,
      error: {
        type: "NostrPublishRejectedError",
        reasons: ["connection failure: x", "Error: blocked"],
      },
    })
  })
  test("publishing a name preserves the picture and all other profile metadata", async () => {
    const metadata = {
      name: "Old name",
      display_name: "Old display name",
      picture: "https://example.com/shop.jpg",
      about: "A coffee shop",
      lud16: "shop@example.com",
      custom: { keep: true },
    }
    const fake = createFakeNostrDep({
      stored: profileEvent(JSON.stringify(metadata)),
    })
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date() },
    })
    const result = await run(
      publishNostrProfileName({ name: NonEmptyString255(" New shop ") })
    )
    expect(result).toEqual({
      ok: true,
      value: {
        name: "New shop",
        picture: metadata.picture,
        metadata: { ...metadata, name: "New shop", display_name: "New shop" },
      },
    })
    expect(JSON.parse(fake.published[0]?.content ?? "null")).toEqual({
      ...metadata,
      name: "New shop",
      display_name: "New shop",
    })
  })

  test("publishing a name refuses an unreadable profile instead of overwriting it", async () => {
    const fake = createFakeNostrDep({ connected: false })
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date() },
    })
    const result = await run(
      publishNostrProfileName({ name: NonEmptyString255("New shop") })
    )
    expect(result).toEqual({
      ok: false,
      error: { type: "NostrRelaysUnreachableError" },
    })
    expect(fake.published).toHaveLength(0)
  })

  test("publishing a name reports a rejected publish", async () => {
    const fake = createFakeNostrDep({ publishResults: [new Error("blocked")] })
    await using run = testCreateRun({
      ...fake.deps,
      masterKey,
      date: { now: () => new Date() },
    })
    const result = await run(
      publishNostrProfileName({ name: NonEmptyString255("New shop") })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.type).toBe("NostrPublishRejectedError")
  })
})
