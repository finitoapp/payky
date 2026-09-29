import { describe, expect, test } from "vitest"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  calculateRefundLineAmount,
  deriveRefundableAmount,
  deriveRefundableLines,
  deriveRefundPrefillAmount,
  deriveRefundState,
  summarizeRefundsByPayment,
} from "./refund-utils.ts"

const lineId = "line" as PaymentLineId

const threeCoffees = {
  id: lineId,
  type: "catalogItem",
  quantity: PositiveNumber(3),
  totalAmount: NonNegativeInteger(10_000),
} as const

describe("deriveRefundableAmount", () => {
  test("is the cash received when there is one", () => {
    expect(
      deriveRefundableAmount({
        amount: NonNegativeInteger(7_890),
        cashReceivedAmount: NonNegativeInteger(7_900),
        excess: NonNegativeInteger(0),
      })
    ).toBe(7_900)
    expect(
      deriveRefundableAmount({
        amount: NonNegativeInteger(7_890),
        cashReceivedAmount: null,
        excess: NonNegativeInteger(0),
      })
    ).toBe(7_890)
  })

  test("adds what the payment received beyond its amount", () => {
    expect(
      deriveRefundableAmount({
        amount: NonNegativeInteger(25_000),
        cashReceivedAmount: NonNegativeInteger(25_000),
        excess: NonNegativeInteger(25_000),
      })
    ).toBe(50_000)
  })
})

describe("deriveRefundPrefillAmount", () => {
  test.each([
    { remaining: 25_000, excess: 0, prefill: 25_000 },
    { remaining: 50_000, excess: 25_000, prefill: 25_000 },
    { remaining: 10_000, excess: 25_000, prefill: 10_000 },
  ])(
    "prefills $prefill of $remaining left with $excess excess",
    ({ remaining, excess, prefill }) => {
      expect(
        deriveRefundPrefillAmount({
          remainingAmount: NonNegativeInteger(remaining),
          excess: NonNegativeInteger(excess),
        })
      ).toBe(prefill)
    }
  )
})

describe("summarizeRefundsByPayment", () => {
  const paymentId = "payment" as PaymentId
  const refundOf = (amount: number, claimAmounts: ReadonlyArray<number>) => ({
    paymentId,
    amount: NonNegativeInteger(amount),
    currency: "CZK" as const,
    paymentAmount: NonNegativeInteger(25_000),
    paymentCurrency: "CZK" as const,
    paymentAmountSats: null,
    cashReceivedAmount: null,
    paymentClaims: claimAmounts.map((claimAmount, index) => ({
      accountTransactionId: `tx-${index}` as AccountTransactionId,
      amount: claimAmount,
      currency: "CZK" as const,
    })),
  })

  test("measures a returned duplicate against everything the payment received", () => {
    const summary = summarizeRefundsByPayment([
      refundOf(25_000, [25_000, 25_000]),
    ]).get(paymentId)

    expect(summary).toEqual({
      refundedAmount: 25_000,
      refundableAmount: 50_000,
      currency: "CZK",
    })
    expect(summary === undefined ? null : deriveRefundState(summary)).toBe(
      "partial"
    )
  })

  test("reads a payment settled once and refunded in full as full", () => {
    const summary = summarizeRefundsByPayment([refundOf(25_000, [25_000])]).get(
      paymentId
    )

    expect(summary === undefined ? null : deriveRefundState(summary)).toBe(
      "full"
    )
  })
})

describe("deriveRefundState", () => {
  test.each([
    [0, "none"],
    [5_000, "partial"],
    [25_000, "full"],
  ] as const)("reads %i refunded of 25000 as %s", (refundedAmount, state) => {
    expect(
      deriveRefundState({
        refundedAmount: NonNegativeInteger(refundedAmount),
        refundableAmount: NonNegativeInteger(25_000),
      })
    ).toBe(state)
  })
})

describe("deriveRefundableLines", () => {
  test("leaves out tips and what was already refunded", () => {
    const tip = {
      id: "tip" as PaymentLineId,
      type: "tip",
      quantity: PositiveNumber(1),
      totalAmount: NonNegativeInteger(2_000),
    } as const

    expect(
      deriveRefundableLines(
        [threeCoffees, tip],
        [
          {
            paymentLineId: lineId,
            quantity: PositiveNumber(1),
            amount: NonNegativeInteger(3_333),
          },
        ]
      )
    ).toEqual([
      { line: threeCoffees, remainingQuantity: 2, remainingAmount: 6_667 },
    ])
  })
})

describe("calculateRefundLineAmount", () => {
  test("returns the rest of the line without a rounding remainder", () => {
    const [first] = deriveRefundableLines([threeCoffees], [])
    if (first === undefined) throw new Error("Expected a refundable line.")
    expect(calculateRefundLineAmount(first, 1)).toBe(3_333)

    const [rest] = deriveRefundableLines(
      [threeCoffees],
      [
        {
          paymentLineId: lineId,
          quantity: PositiveNumber(1),
          amount: NonNegativeInteger(3_333),
        },
      ]
    )
    if (rest === undefined) throw new Error("Expected a refundable line.")
    expect(calculateRefundLineAmount(rest, 2)).toBe(6_667)
  })
})
