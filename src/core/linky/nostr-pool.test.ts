import { describe, expect, test } from "vitest"

import { normalizeRelayUrl, uniqueRelayUrls } from "./nostr-pool.ts"

describe("normalizeRelayUrl", () => {
  test("lower-cases the host and drops the bare-origin slash", () => {
    expect(normalizeRelayUrl(" wss://Relay.Damus.io/ ")).toBe(
      "wss://relay.damus.io"
    )
    expect(normalizeRelayUrl("ws://localhost:7777")).toBe("ws://localhost:7777")
  })

  test("keeps a path", () => {
    expect(normalizeRelayUrl("wss://relay.example/inbox/")).toBe(
      "wss://relay.example/inbox/"
    )
  })

  test("rejects anything that is not a websocket URL", () => {
    expect(normalizeRelayUrl("https://relay.damus.io")).toBeNull()
    expect(normalizeRelayUrl("relay.damus.io")).toBeNull()
    expect(normalizeRelayUrl("")).toBeNull()
  })
})

describe("uniqueRelayUrls", () => {
  test("dedupes after normalization and keeps order", () => {
    expect(
      uniqueRelayUrls([
        "wss://a.example/",
        "wss://b.example",
        "wss://A.example",
      ])
    ).toEqual(["wss://a.example", "wss://b.example"])
  })
})
