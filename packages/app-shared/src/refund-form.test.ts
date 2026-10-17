import type { PaymentLineId } from "@payky/core/modules/payment-line/payment-line-types"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { describe, expect, test } from "vitest"
import {
  defaultRefundMethod,
  deriveRefundAmountText,
  deriveRefundAvailability,
  deriveRefundForm,
  type RefundablePaymentLine,
  stepRefundQuantity,
} from "./refund-form.ts"

const n = NonNegativeInteger
const lineId = "line-1" as unknown as PaymentLineId
const beer = {
  id: lineId,
  type: "catalogItem",
  quantity: 2,
  totalAmount: 9001,
  name: "Beer",
} as unknown as RefundablePaymentLine
const refundable = {
  line: beer,
  remainingQuantity: 2,
  remainingAmount: n(9001),
}

const payment = {
  billId: "bill-1" as never,
  amount: n(10000),
  tipAmount: n(0),
  currency: "CZK" as const,
  cashReceivedAmount: null,
}

describe("refund availability (refund/0002, 0005)", () => {
  const base = {
    payment,
    excess: n(0),
    isPaid: true,
    refunds: [],
    refundLines: [],
    paymentLines: [beer],
    hasOtherClaimedPayment: false,
  }

  test("offers items only from a bill's only payment", () => {
    expect(deriveRefundAvailability(base).refundableLines).toHaveLength(1)
    expect(
      deriveRefundAvailability({ ...base, hasOtherClaimedPayment: true })
        .refundableLines
    ).toEqual([])
    expect(
      deriveRefundAvailability({
        ...base,
        payment: { ...payment, billId: null },
      }).refundableLines
    ).toEqual([])
  })

  test("offers nothing on an unpaid payment and counts earlier refunds", () => {
    expect(deriveRefundAvailability({ ...base, isPaid: false }).canRefund).toBe(
      false
    )
    const refunded = deriveRefundAvailability({
      ...base,
      refunds: [{ amount: n(10000), isTip: null }],
    })
    expect(refunded.remainingAmount).toBe(0)
    expect(refunded.canRefund).toBe(false)
  })
})

describe("refund form", () => {
  const form = {
    mode: "amount" as const,
    amountText: "50",
    quantities: {},
    refundableLines: [refundable],
    remainingAmount: n(10000),
    currency: "CZK" as const,
  }

  test("a typed amount above what is left is not valid", () => {
    expect(deriveRefundForm(form).refundAmount).toBe(5000)
    expect(deriveRefundForm({ ...form, amountText: "101" }).refundAmount).toBe(
      null
    )
    expect(deriveRefundForm({ ...form, amountText: "abc" }).refundAmount).toBe(
      null
    )
  })

  test("items refund the rest of a line without a rounding remainder", () => {
    const items = { ...form, mode: "items" as const }
    expect(deriveRefundForm(items).refundAmount).toBe(null)
    expect(
      deriveRefundForm({ ...items, quantities: { [lineId]: 1 } }).refundAmount
    ).toBe(4501)
    expect(
      deriveRefundForm({ ...items, quantities: { [lineId]: 2 } }).refundAmount
    ).toBe(9001)
  })

  test("steps a quantity within what is left", () => {
    const up = stepRefundQuantity({ [lineId]: 2 }, refundable, 1)
    expect(up[lineId]).toBe(2)
    expect(stepRefundQuantity({}, refundable, -1)[lineId]).toBe(0)
    expect(stepRefundQuantity({}, refundable, 1)[lineId]).toBe(1)
  })

  test("prefills whole crowns from the cash register, the exact amount outside (refund/0006)", () => {
    const text = (method: "cashRegister" | "outside", left = 7940) =>
      deriveRefundAmountText({
        typedAmountText: null,
        remainingAmount: n(left),
        excess: n(0),
        method,
        currency: "CZK",
      })
    expect(text("outside")).toBe("79.4")
    expect(text("cashRegister")).toBe("79")
    // Rounding up would exceed what is left, so one crown lower.
    expect(text("cashRegister", 7890)).toBe("78")
    expect(
      deriveRefundAmountText({
        typedAmountText: "12",
        remainingAmount: n(7890),
        excess: n(0),
        method: "cashRegister",
        currency: "CZK",
      })
    ).toBe("12")
  })

  test("starts on the cash register when the payment took cash", () => {
    expect(defaultRefundMethod(["cashRegister"])).toBe("cashRegister")
    expect(defaultRefundMethod(["bank"])).toBe("outside")
  })
})
