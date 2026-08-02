import { describe, expect, test } from "vitest"

import { decimalAmountToMinorUnits } from "./money.ts"

describe("decimalAmountToMinorUnits", () => {
  test("converts decimal values including a localized decimal separator", () => {
    expect(decimalAmountToMinorUnits({ currency: "CZK", value: "12.50" })).toBe(
      1_250
    )
    expect(decimalAmountToMinorUnits({ currency: "EUR", value: "0,50" })).toBe(
      50
    )
  })

  test("rejects values with too many decimal places", () => {
    expect(
      decimalAmountToMinorUnits({ currency: "CZK", value: "12.555" })
    ).toBe(null)
  })

  test("rejects zero, negative, invalid, and unsafe amounts", () => {
    expect(decimalAmountToMinorUnits({ currency: "CZK", value: "0" })).toBe(
      null
    )
    expect(decimalAmountToMinorUnits({ currency: "CZK", value: "-5" })).toBe(
      null
    )
    expect(
      decimalAmountToMinorUnits({ currency: "CZK", value: "twenty" })
    ).toBe(null)
    expect(
      decimalAmountToMinorUnits({
        currency: "CZK",
        value: "90071992547409.92",
      })
    ).toBe(null)
  })
})
