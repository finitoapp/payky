import { describe, expect, test } from "vitest"
import type { Currency } from "@/core/modules/shared/schema.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import {
  formatAddressGroups,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatSatsAmount,
  formatTime,
} from "./format-utils.ts"

/**
 * `Intl` separates a currency code or symbol from the number with a
 * non-breaking space, and groups digits with one in `cs-CZ`. Built from its
 * code point rather than written as a literal: the formatter rewrites a
 * "\u00a0" escape into the character itself, which then reads as an ordinary
 * space in every editor while never matching one.
 */
const NBSP = String.fromCodePoint(0x00a0)

describe("formatAmount", () => {
  test("formats a fiat amount for the locale", () => {
    expect(formatAmount(5, "USD")).toBe("$5.00")
    expect(formatAmount(1299.5, "CZK", "cs-CZ")).toBe(`1${NBSP}299,50${NBSP}Kč`)
  })

  test("reads a BTC amount as whole bitcoin and shows satoshis", () => {
    expect(formatAmount(0.00000001, "BTC")).toBe(`Sats${NBSP}1`)
    expect(formatAmount(1, "BTC")).toBe(`Sats${NBSP}100,000,000`)
  })

  test("falls back to a bare number when there is no currency", () => {
    // `style: "currency"` without a currency throws, so this is the `catch`
    // branch — note it also drops the two fraction digits every other amount
    // on screen carries.
    expect(formatAmount(5, undefined)).toBe("5")
  })

  test("falls back for a malformed currency code, but not an unknown one", () => {
    // Only a code `Intl` refuses to parse reaches the fallback. A well-formed
    // three-letter code it has never heard of formats fine, so the fallback is
    // narrower than "the currency is wrong".
    expect(formatAmount(5, "XY" as Currency)).toBe("5 XY")
    expect(formatAmount(5, "XYZ" as Currency)).toBe(`XYZ${NBSP}5.00`)
  })
})

describe("formatMoney", () => {
  test("renders fiat minor units", () => {
    expect(
      formatMoney({ value: Integer(129_900), currency: "CZK" }, "cs-CZ")
    ).toBe(`1${NBSP}299,00${NBSP}Kč`)
    expect(formatMoney({ value: Integer(-500), currency: "USD" })).toBe(
      "-$5.00"
    )
  })

  test("renders a single satoshi", () => {
    expect(formatMoney({ value: Integer(1), currency: "BTC" })).toBe(
      `Sats${NBSP}1`
    )
  })

  test("agrees with formatSatsAmount across the satoshi range", () => {
    // A BTC `Money` goes minor units -> decimal string -> float -> back to
    // satoshis, so every one of these is a round trip through a `number`.
    // 999_999_999_999_999 is the interesting one: it comes back as
    // 999999999999999.1, which only lands on the right integer because the
    // formatter rounds to whole satoshis.
    for (const sats of [
      1, 99, 12_345_678, 100_000_001, 999_999_999_999_999,
      2_100_000_000_000_000,
    ]) {
      expect(formatMoney({ value: Integer(sats), currency: "BTC" })).toBe(
        `Sats${NBSP}${formatSatsAmount(sats, "en-US")}`
      )
    }
  })
})

describe("date formatters", () => {
  // 09:09 in Europe/Prague, the zone the test run pins (see vite.config.ts).
  // Winter, so the offset is CET and no DST transition is in play.
  const instant = new Date("2026-01-05T08:09:00Z")

  test("formats a medium date for the locale", () => {
    expect(formatDate(instant)).toBe("Jan 5, 2026")
    expect(formatDate(instant, "cs-CZ")).toBe("5. 1. 2026")
  })

  test("formats a short time in the configured zone", () => {
    expect(formatTime(instant, "cs-CZ")).toBe("9:09")
  })

  test("combines the medium date and the short time", () => {
    // Asserted by parts rather than as one literal: ICU has changed the
    // separator it puts before AM/PM between versions, and that is not what
    // this function is promising.
    const formatted = formatDateTime(instant)

    expect(formatted).toContain(formatDate(instant))
    expect(formatted).toContain(formatTime(instant))
  })
})

describe("formatSatsAmount", () => {
  test("groups digits for the given locale", () => {
    expect(formatSatsAmount(1_234_567, "en-US")).toBe("1,234,567")
  })
})

describe("formatAddressGroups", () => {
  test("preserves exact casing when grouping Base58 addresses for review", () => {
    const address = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"

    expect(formatAddressGroups(address)).toBe(
      "1BvB MSEY stWe tqTF n5Au 4m4G Fg7x JaNV N2"
    )
  })

  test("regroups a string that already carries spacing", () => {
    expect(formatAddressGroups("CZ65 0800 0000 1920 0014 5399")).toBe(
      "CZ65 0800 0000 1920 0014 5399"
    )
  })
})
