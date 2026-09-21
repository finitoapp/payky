import { PaymentRequest } from "@cashu/cashu-ts"
import { decode } from "nostr-tools/nip19"
import { describe, expect, test } from "vitest"

import {
  buildCashuPaymentRequest,
  parseCashuPaymentRequestPayload,
} from "@/core/modules/payment/payment-cashu-request-utils.ts"

const pubkey =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"

describe("buildCashuPaymentRequest", () => {
  test("encodes a single-use creqA request for the quote's amount at the mint", () => {
    const encoded = buildCashuPaymentRequest({
      amountSats: 210,
      mintUrl: "https://mint.example.com",
      quoteId: "quote-1",
      recipient: { pubkey, relays: ["wss://relay.example.com"] },
    })

    expect(encoded.startsWith("creqA")).toBe(true)
    expect(PaymentRequest.fromEncodedRequest(encoded).toRawRequest()).toEqual({
      i: "quote-1",
      a: 210n,
      u: "sat",
      s: true,
      m: ["https://mint.example.com"],
      t: [
        {
          t: "nostr",
          a: expect.stringMatching(/^nprofile1/),
          g: [["n", "17"]],
        },
      ],
    })
  })

  test("addresses the NIP-17 transport to the recipient with their relays", () => {
    const encoded = buildCashuPaymentRequest({
      amountSats: 1,
      mintUrl: "https://mint.example.com",
      quoteId: "quote-2",
      recipient: {
        pubkey,
        relays: ["wss://relay.example.com", "wss://nostr.linky.fit"],
      },
    })
    const transport = PaymentRequest.fromEncodedRequest(encoded).transport?.[0]

    expect(transport).toBeDefined()
    expect(decode(transport?.target ?? "")).toEqual({
      type: "nprofile",
      data: {
        pubkey,
        relays: ["wss://relay.example.com", "wss://nostr.linky.fit"],
      },
    })
  })
})

describe("parseCashuPaymentRequestPayload", () => {
  const proof = { id: "00ad268c4d1f5826", amount: 8, secret: "s", C: "02ab" }

  test("reads the proofs and the request id a wallet answers with", () => {
    expect(
      parseCashuPaymentRequestPayload(
        JSON.stringify({
          id: "quote-1",
          mint: "https://mint.example.com",
          unit: "sat",
          proofs: [proof],
        })
      )
    ).toEqual({
      id: "quote-1",
      mint: "https://mint.example.com",
      unit: "sat",
      proofs: [proof],
    })
  })

  test("is null for a chat line, a bare token, or a payload without proofs", () => {
    expect(parseCashuPaymentRequestPayload("thanks!")).toBeNull()
    expect(parseCashuPaymentRequestPayload("cashuBabc")).toBeNull()
    expect(
      parseCashuPaymentRequestPayload(
        JSON.stringify({
          mint: "https://mint.example.com",
          unit: "sat",
          proofs: [],
        })
      )
    ).toBeNull()
    expect(parseCashuPaymentRequestPayload("{not json")).toBeNull()
  })
})
