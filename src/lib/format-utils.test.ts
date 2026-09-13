import { describe, expect, test } from "vitest"

import { formatAddressGroups, formatSatsAmount } from "./format-utils.ts"

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

describe("formatSatsAmount", () => {
  test("groups digits for the given locale", () => {
    expect(formatSatsAmount(1_234_567, "en-US")).toBe("1,234,567")
  })
})
