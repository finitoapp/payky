import { describe, expect, test } from "vitest"

import {
  calculatePaymentAmounts,
  calculatePercentageTipAmount,
} from "./payment-tip-utils.ts"

describe("calculatePercentageTipAmount", () => {
  test("rounds percentage tips to the nearest minor unit", () => {
    expect(calculatePercentageTipAmount({ amount: 500, percentage: 5 })).toBe(
      25
    )
    expect(calculatePercentageTipAmount({ amount: 10, percentage: 5 })).toBe(1)
  })
})

describe("calculatePaymentAmounts", () => {
  test("keeps the tip separately while adding it to the payment total", () => {
    expect(calculatePaymentAmounts({ amount: 500, tipAmount: 25 })).toEqual({
      amount: 525,
      tipAmount: 25,
    })
  })

  test("supports an explicit no-tip selection", () => {
    expect(calculatePaymentAmounts({ amount: 500, tipAmount: 0 })).toEqual({
      amount: 500,
      tipAmount: 0,
    })
  })
})
