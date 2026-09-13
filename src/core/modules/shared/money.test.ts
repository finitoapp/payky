import { describe, expect, test } from "vitest"

import { Integer } from "@/core/modules/shared/schema.ts"
import {
  btcToSats,
  decimalAmountToMinorUnits,
  fiatMinorUnitsToSats,
  fiatToSats,
  minorUnitsToDecimalString,
  SATS_PER_BTC,
  satsToFiat,
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

describe("btcToSats", () => {
  test("converts whole and fractional BTC", () => {
    expect(btcToSats(1)).toBe(SATS_PER_BTC)
    expect(btcToSats(0.000_012_34)).toBe(1234)
  })

  test("does not floor — an amount below half a sat is zero", () => {
    expect(btcToSats(0.000_000_004)).toBe(0)
  })
})

describe("fiatToSats", () => {
  test("converts at the given rate", () => {
    // 1 BTC costs 2,000,000 CZK, so 20,000 CZK is 0.01 BTC.
    expect(fiatToSats({ fiatAmount: 20_000, exchangeRate: 2_000_000 })).toBe(
      1_000_000
    )
  })

  test("floors at one sat instead of rounding down to an amountless invoice", () => {
    // 0.01 CZK at this rate is 0.1 sats, which Math.round takes to zero.
    // Beware 0.5 sats as a test input: Math.round(0.5) is already 1, so it
    // passes whether or not the floor is there.
    expect(fiatToSats({ fiatAmount: 0.01, exchangeRate: 10_000_000 })).toBe(1)
  })

  test("rounds to the nearest sat", () => {
    expect(fiatToSats({ fiatAmount: 0.026, exchangeRate: 2_000_000 })).toBe(1)
    expect(fiatToSats({ fiatAmount: 0.031, exchangeRate: 2_000_000 })).toBe(2)
  })
})

describe("fiatMinorUnitsToSats", () => {
  test("divides by the currency's own minor-unit factor", () => {
    expect(
      fiatMinorUnitsToSats({
        amount: 2_000_000,
        currency: "CZK",
        exchangeRate: 2_000_000,
      })
    ).toBe(1_000_000)
  })

  test("keeps the one-sat floor for the smallest chargeable amount", () => {
    expect(
      fiatMinorUnitsToSats({
        amount: 1,
        currency: "CZK",
        exchangeRate: 10_000_000,
      })
    ).toBe(1)
  })
})

describe("satsToFiat", () => {
  test("inverts fiatToSats for an amount above the floor", () => {
    const fiatAmount = 20_000
    const exchangeRate = 2_000_000
    expect(
      satsToFiat({
        sats: fiatToSats({ fiatAmount, exchangeRate }),
        exchangeRate,
      })
    ).toBe(fiatAmount)
  })
})
