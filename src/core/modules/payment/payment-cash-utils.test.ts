import { describe, expect, test } from "vitest"

import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { roundCashAmount } from "./payment-cash-utils.ts"

describe("roundCashAmount", () => {
  test.each([
    [7_890, 7_900],
    [7_840, 7_800],
    [7_850, 7_900],
    [7_900, 7_900],
    [49, 0],
    [50, 100],
  ])("rounds %i CZK minor units to %i", (amount, rounded) => {
    expect(
      roundCashAmount({ amount: NonNegativeInteger(amount), currency: "CZK" })
    ).toBe(rounded)
  })

  test("keeps any other currency exact", () => {
    expect(
      roundCashAmount({ amount: NonNegativeInteger(1_234), currency: "EUR" })
    ).toBe(1_234)
  })
})
