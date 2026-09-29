import { describe, expect, test } from "vitest"

import type { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  calculateRefundLineAmount,
  deriveRefundableAmount,
  deriveRefundableLines,
  deriveRefundState,
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
      })
    ).toBe(7_900)
    expect(
      deriveRefundableAmount({
        amount: NonNegativeInteger(7_890),
        cashReceivedAmount: null,
      })
    ).toBe(7_890)
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
