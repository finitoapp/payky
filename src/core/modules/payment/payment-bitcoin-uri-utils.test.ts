import { describe, expect, test } from "vitest"

import { buildBitcoinPaymentUri } from "@/core/modules/payment/payment-bitcoin-uri-utils.ts"

describe("buildBitcoinPaymentUri", () => {
  test("combines a Lightning and a Spark invoice into one BIP-321 uri", () => {
    expect(
      buildBitcoinPaymentUri({
        lightningInvoice: "lnbc10n1cashu",
        sparkInvoice: "spark1abc",
      })
    ).toBe("bitcoin:?lightning=lnbc10n1cashu&spark=spark1abc")
  })

  test("uses the bare invoice when only one instruction exists", () => {
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
  })

  test("has no payload without any instruction", () => {
    expect(
      buildBitcoinPaymentUri({ lightningInvoice: null, sparkInvoice: "" })
    ).toBeNull()
  })
})
