import { finalizeEvent, generateSecretKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { parseRelayListEvent, pickRelayList } from "./nostr-relay-lists.ts"

const secretKey = generateSecretKey()
const event = (kind: number, tags: string[][], createdAt: number) =>
  finalizeEvent({ kind, created_at: createdAt, tags, content: "" }, secretKey)

describe("parseRelayListEvent", () => {
  test("reads NIP-65 `r` tags, dropping markers, duplicates and junk", () => {
    expect(
      parseRelayListEvent(
        event(
          10002,
          [
            ["r", "wss://relay.damus.io/"],
            ["r", "wss://nos.lol", "read"],
            ["r", "wss://relay.damus.io"],
            ["r", "https://not-a-relay.example"],
            ["e", "wss://ignored.example"],
          ],
          1
        )
      )
    ).toEqual(["wss://relay.damus.io", "wss://nos.lol"])
  })

  test("reads NIP-17 `relay` tags", () => {
    expect(
      parseRelayListEvent(event(10050, [["relay", "wss://nos.lol"]], 1))
    ).toEqual(["wss://nos.lol"])
  })

  test("is null for other kinds", () => {
    expect(parseRelayListEvent(event(0, [], 1))).toBeNull()
  })
})

describe("pickRelayList", () => {
  test("prefers the newest NIP-65 list over any DM relay list", () => {
    expect(
      pickRelayList([
        event(10050, [["relay", "wss://dm.example"]], 30),
        event(10002, [["r", "wss://old.example"]], 10),
        event(10002, [["r", "wss://new.example"]], 20),
      ])
    ).toEqual({ relayUrls: ["wss://new.example"], updatedAt: 20 })
  })

  test("falls back to the DM relay list", () => {
    expect(
      pickRelayList([event(10050, [["relay", "wss://dm.example"]], 5)])
    ).toEqual({ relayUrls: ["wss://dm.example"], updatedAt: 5 })
  })

  test("is null without a usable list", () => {
    expect(pickRelayList([])).toBeNull()
    expect(pickRelayList([event(10002, [["r", "nope"]], 1)])).toBeNull()
  })
})
