import { describe, expect, test } from "vitest"
import {
  createTestInvoice,
  testPreimage,
  testPreimagePaymentHash,
} from "./lightning-invoice-test-fixtures.ts"
import {
  parseLightningInvoice,
  verifyLightningPreimage,
} from "./lightning-invoice-utils.ts"

describe("verifyLightningPreimage", () => {
  test("accepts the preimage whose SHA-256 is the invoice's payment hash", () => {
    const invoice = parseLightningInvoice(
      createTestInvoice({ paymentHash: testPreimagePaymentHash })
    )
    expect(invoice.ok).toBe(true)
    if (!invoice.ok || invoice.value.paymentHash === null) return

    expect(
      verifyLightningPreimage({
        preimage: testPreimage,
        paymentHash: invoice.value.paymentHash,
      })
    ).toBe(true)
  })

  test("ignores the case of either side", () => {
    expect(
      verifyLightningPreimage({
        preimage: testPreimage.toUpperCase(),
        paymentHash: testPreimagePaymentHash.toUpperCase(),
      })
    ).toBe(true)
  })

  test("rejects a preimage of another invoice", () => {
    expect(
      verifyLightningPreimage({
        preimage: "44".repeat(32),
        paymentHash: testPreimagePaymentHash,
      })
    ).toBe(false)
  })

  test("rejects a preimage that is not 32 bytes of hex", () => {
    expect(
      verifyLightningPreimage({
        preimage: "abc",
        paymentHash: testPreimagePaymentHash,
      })
    ).toBe(false)
    expect(
      verifyLightningPreimage({
        preimage: `${testPreimage}00`,
        paymentHash: testPreimagePaymentHash,
      })
    ).toBe(false)
  })
})
