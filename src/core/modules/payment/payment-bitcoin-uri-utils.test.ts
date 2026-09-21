import { describe, expect, test } from "vitest"

import {
  buildBitcoinPaymentUri,
  buildBitcoinQrPayloads,
  isBitcoinQrMode,
} from "@/core/modules/payment/payment-bitcoin-uri-utils.ts"

describe("buildBitcoinPaymentUri", () => {
  test("combines a Lightning and a Spark invoice into one BIP-321 uri", () => {
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: "spark1abc",
      })
    ).toBe("bitcoin:?lightning=lnbc10n1cashu&spark=spark1abc")
  })

  test("carries the cashu request as creq next to the mint's invoice", () => {
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: null,
        cashuRequest: "creqAabc",
      })
    ).toBe("bitcoin:?lightning=lnbc10n1cashu&creq=creqAabc")
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: "spark1abc",
        cashuRequest: "creqAabc",
      })
    ).toBe("bitcoin:?lightning=lnbc10n1cashu&creq=creqAabc&spark=spark1abc")
  })

  test("uses the bare instruction when only one exists", () => {
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: "lnbc10n1x",
        sparkInvoice: null,
      })
    ).toBe("lnbc10n1x")
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: null,
        sparkInvoice: "spark1abc",
      })
    ).toBe("spark1abc")
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: null,
        sparkInvoice: null,
        cashuRequest: "creqAabc",
      })
    ).toBe("creqAabc")
  })

  test("has no payload without any instruction", () => {
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: null,
        sparkInvoice: "",
        cashuRequest: "",
      })
    ).toBeNull()
  })
})

describe("buildBitcoinQrPayloads", () => {
  test("offers the request, the invoice and the uri carrying both", () => {
    expect(
      buildBitcoinQrPayloads({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: null,
        cashuRequest: "creqAabc",
      })
    ).toEqual({
      cashu: "creqAabc",
      universal: "bitcoin:?lightning=lnbc10n1cashu&creq=creqAabc",
      lightning: "lnbc10n1cashu",
    })
  })

  test("leaves a mode empty while its instruction is not prepared", () => {
    expect(
      buildBitcoinQrPayloads({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: null,
        cashuRequest: null,
      })
    ).toEqual({
      cashu: null,
      universal: "lnbc10n1cashu",
      lightning: "lnbc10n1cashu",
    })
  })
})

describe("isBitcoinQrMode", () => {
  test("accepts the three modes and nothing else", () => {
    expect(isBitcoinQrMode("cashu")).toBe(true)
    expect(isBitcoinQrMode("universal")).toBe(true)
    expect(isBitcoinQrMode("lightning")).toBe(true)
    expect(isBitcoinQrMode("spark")).toBe(false)
    expect(isBitcoinQrMode(undefined)).toBe(false)
  })
})
