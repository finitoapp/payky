import { describe, expect, test } from "vitest"

import {
  appOwnerIdPlaceholder,
  defaultEvoluTransportUrls,
  resolveTransportUrl,
} from "@/core/evolu/device-account.ts"

// Shaped like a real one: 22 Base64Url characters.
const appOwnerId = "Vu6kLCCtCCwfgw5M7Kq6Fg"

describe("resolveTransportUrl", () => {
  test("substitutes the placeholder with the app owner id", () => {
    expect(
      resolveTransportUrl(
        `wss://live-relay.payky.me/${appOwnerIdPlaceholder}`,
        appOwnerId
      )
    ).toBe(`wss://live-relay.payky.me/${appOwnerId}`)
  })

  test("substitutes it percent-encoded too, so a room is never shared", () => {
    expect(
      resolveTransportUrl(
        "wss://live-relay.payky.me/$%7BappOwnerId%7D",
        appOwnerId
      )
    ).toBe(`wss://live-relay.payky.me/${appOwnerId}`)
  })

  test("leaves a URL without the placeholder alone", () => {
    expect(resolveTransportUrl("wss://evolu.linky.fit", appOwnerId)).toBe(
      "wss://evolu.linky.fit"
    )
  })
})

describe("defaultEvoluTransportUrls", () => {
  test("stores the live relay's room as a placeholder, not as an id", () => {
    const [plainRelay, liveRelay] = defaultEvoluTransportUrls

    expect(plainRelay).toBe("wss://evolu.linky.fit")
    expect(liveRelay).toBe(`wss://live-relay.payky.me/${appOwnerIdPlaceholder}`)
    expect(liveRelay).not.toContain(appOwnerId)
  })

  test("resolve to a room id a relay accepts", () => {
    const [, liveRelay] = defaultEvoluTransportUrls
    const resolved = resolveTransportUrl(liveRelay, appOwnerId)

    expect(resolved.slice("wss://live-relay.payky.me/".length)).toMatch(
      /^[A-Za-z0-9_-]+$/u
    )
  })
})
