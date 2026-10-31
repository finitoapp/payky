import { base64urlnopad } from "@scure/base"
import { decode } from "cbor-x"
import { describe, expect, test } from "vitest"
import {
  buildBip321PaymentUri,
  buildCashuPaymentUri,
  encodeNostrPaymentRequest,
  NUT18_MAX_MINTS,
  pickBip321PayableLeg,
} from "./cashu-payment-request.ts"

/** `buildBip321PaymentUri`, then `pickBip321PayableLeg` of its parse; Linky builds the same. */
const BIP321_VECTORS: ReadonlyArray<{
  readonly legs: { readonly lightning?: string; readonly creq?: string }
  readonly uri: string | null
  readonly leg: { readonly kind: string; readonly value: string } | null
}> = [
  {
    legs: { lightning: "lightning:LNBC10N1PXYZ" },
    uri: "bitcoin:?lightning=LNBC10N1PXYZ",
    leg: { kind: "lightning", value: "LNBC10N1PXYZ" },
  },
  {
    legs: { lightning: "lnbc10n1pxyz", creq: "creqAabc+/=" },
    uri: "bitcoin:?lightning=lnbc10n1pxyz&creq=creqAabc%2B%2F%3D",
    leg: { kind: "cashu-request", value: "creqAabc+/=" },
  },
  {
    legs: { creq: "creqAabc" },
    uri: "bitcoin:?creq=creqAabc",
    leg: { kind: "cashu-request", value: "creqAabc" },
  },
  { legs: {}, uri: null, leg: null },
  {
    legs: { lightning: " lnbc10n1pxyz ", creq: "" },
    uri: "bitcoin:?lightning=lnbc10n1pxyz",
    leg: { kind: "lightning", value: "lnbc10n1pxyz" },
  },
]

/** What `encodeNostrPaymentRequest` makes of these, byte for byte as Linky does. */
const NUT18_VECTORS = [
  {
    args: {
      amount: 8600,
      mintUrls: ["https://cashu.cz"],
      recipientNprofile: "nprofile1qqsxyz",
      requestId: "pay-1",
      description: "Coffee",
    },
    request:
      "creqAuQAHYWEZIZhhdWNzYXRhc_VhbYFwaHR0cHM6Ly9jYXNodS5jemF0gbkAA2F0ZW5vc3RyYWFvbnByb2ZpbGUxcXFzeHl6YWeBgmFuYjE3YWllcGF5LTFhZGZDb2ZmZWU",
  },
  {
    args: {
      amount: 21,
      mintUrls: ["https://cashu.cz", " "],
      recipientNprofile: "nprofile1abc",
      requestId: null,
      description: "  ",
    },
    request:
      "creqAuQAFYWEVYXVjc2F0YXP1YW2BcGh0dHBzOi8vY2FzaHUuY3phdIG5AANhdGVub3N0cmFhbG5wcm9maWxlMWFiY2FngYJhbmIxNw",
  },
]

describe("the Cashu tab's payment request", () => {
  test.each(NUT18_VECTORS)("NUT-18 request $request", (vector) => {
    expect(encodeNostrPaymentRequest(vector.args)).toBe(vector.request)
  })

  test("names the trusted mints it is given, in their order (cashu/0016)", () => {
    const mints = [
      "https://default.mint.test",
      "https://second.mint.test",
      "https://third.mint.test",
    ]
    const uri = buildCashuPaymentUri({
      paymentId: "payment-1",
      lnInvoice: "lnbc1test",
      amountSats: 21,
      mintUrls: mints,
      nostrPubkey: "a".repeat(64),
      relays: ["wss://relay.test"],
    })
    const creq = new URL(uri ?? "").searchParams.get("creq") ?? ""
    const request = decode(base64urlnopad.decode(creq.slice("creqA".length)))
    expect(request).toMatchObject({ a: 21, m: mints, i: "payment-1" })
    expect(NUT18_MAX_MINTS).toBe(3)
  })

  test("leaves the token leg out with no mint to name", () => {
    expect(
      buildCashuPaymentUri({
        paymentId: "payment-1",
        lnInvoice: "lnbc1test",
        amountSats: 21,
        mintUrls: [],
        nostrPubkey: "a".repeat(64),
        relays: [],
      })
    ).toBe("bitcoin:?lightning=lnbc1test")
  })

  test.each(BIP321_VECTORS)("BIP-321 $uri", (vector) => {
    expect(buildBip321PaymentUri(vector.legs)).toBe(vector.uri)
    if (vector.uri !== null)
      expect(pickBip321PayableLeg(vector.uri)).toEqual(vector.leg)
  })
})
