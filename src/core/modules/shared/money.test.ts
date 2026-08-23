import { describe, expect, test } from "vitest"

import { Integer } from "@/core/modules/shared/schema.ts"
import {
  decimalAmountToMinorUnits,
  minorUnitsToDecimalString,
} from "./money.ts"

describe("minorUnitsToDecimalString", () => {
  test("formats a two-decimal fiat currency", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(1_250), currency: "CZK" })
    ).toBe("12.5")
  })

  test("formats an eight-decimal BTC amount down to a single sat", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(1), currency: "BTC" })
    ).toBe("0.00000001")
    expect(
      minorUnitsToDecimalString({
        value: Integer(100_000_000),
        currency: "BTC",
      })
    ).toBe("1")
  })

  test("strips trailing fraction zeros", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(1_200), currency: "CZK" })
    ).toBe("12")
  })

  test("pads a value smaller than the fraction digits with a leading zero", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(5), currency: "CZK" })
    ).toBe("0.05")
  })

  test("formats zero without a sign", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(0), currency: "CZK" })
    ).toBe("0")
  })

  test("prefixes negative values with a minus sign", () => {
    expect(
      minorUnitsToDecimalString({ value: Integer(-1_250), currency: "CZK" })
    ).toBe("-12.5")
  })
})

describe("decimalAmountToMinorUnits", () => {
  test("converts decimal values including a localized decimal separator", () => {
    expect(decimalAmountToMinorUnits({ currency: "CZK", value: "12.50" })).toBe(
      1_250
    )
    expect(decimalAmountToMinorUnits({ currency: "EUR", value: "0,50" })).toBe(
      50
    )
  })

  test("accepts a thousands-grouped amount in US convention (comma group, dot decimal)", () => {
    expect(
      decimalAmountToMinorUnits({ currency: "USD", value: "1,234.56" })
    ).toBe(123_456)
  })

  test("accepts a thousands-grouped amount in EU convention (dot group, comma decimal)", () => {
    expect(
      decimalAmountToMinorUnits({ currency: "CZK", value: "1.234,56" })
    ).toBe(123_456)
  })

  test("accepts a trailing decimal separator with no fraction digits yet", () => {
    expect(decimalAmountToMinorUnits({ currency: "CZK", value: "12." })).toBe(
      1_200
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
