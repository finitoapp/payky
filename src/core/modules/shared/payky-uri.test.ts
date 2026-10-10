import { describe, expect, test } from "vitest"

import {
  encodePairUri,
  parsePairUri,
  parsePaykyUri,
} from "@/core/modules/shared/payky-uri.ts"

const pk = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"
const s = "3f9a0c51d2e84b7a96c0e1f2a3b4c5d6"
const relay = "wss://relay.example.com"

const errorType = (text: string) => {
  const parsed = parsePaykyUri(text)
  return parsed.ok ? null : parsed.error.type
}

describe("payky uri", () => {
  test("round-trips a pair code", () => {
    const uri = encodePairUri({ pk, s, r: [relay, "wss://second.example"] })

    expect(uri.startsWith("payky:pair?v=1&")).toBe(true)
    expect(parsePairUri(uri)).toEqual({
      ok: true,
      value: { pk, s, r: [relay, "wss://second.example"] },
    })
  })

  test("reads the scheme case-insensitively and ignores unknown params", () => {
    const parsed = parsePaykyUri(
      `PAYKY:pair?v=1&pk=${pk}&s=${s}&r=${encodeURIComponent(relay)}&x=1`
    )

    expect(parsed).toEqual({
      ok: true,
      value: { type: "pair", v: 1, pk, s, r: [relay] },
    })
  })

  test("tells each kind of bad code apart", () => {
    const params = `pk=${pk}&s=${s}&r=${relay}`

    expect(errorType(`bitcoin:abc?v=1&${params}`)).toBe("NotPaykyUri")
    expect(errorType(`payky:login?v=1&${params}`)).toBe("UnknownPaykyUriType")
    expect(errorType(`payky:pair?v=2&${params}`)).toBe(
      "UnsupportedPaykyUriVersion"
    )
    expect(errorType(`payky:pair?${params}`)).toBe("InvalidPaykyUri")
    expect(errorType(`payky:pair?v=1&pk=${pk}&r=${relay}`)).toBe(
      "InvalidPaykyUri"
    )
  })

  test.each([
    ["a non-wss relay", `pk=${pk}&s=${s}&r=https://relay.example.com`],
    ["a short pk", `pk=${pk.slice(2)}&s=${s}&r=${relay}`],
    ["a short s", `pk=${pk}&s=${s.slice(2)}&r=${relay}`],
    ["no relay", `pk=${pk}&s=${s}`],
    ["three relays", `pk=${pk}&s=${s}&r=${relay}&r=${relay}&r=${relay}`],
  ])("rejects %s", (_name, params) => {
    expect(errorType(`payky:pair?v=1&${params}`)).toBe("InvalidPaykyUri")
  })
})
