import { describe, expect, test } from "vitest"

import {
  defaultTipFixedAmounts,
  defaultTipPercentages,
  parseTipFixedAmounts,
  parseTipPercentages,
  stringifyTipFixedAmounts,
  stringifyTipPercentages,
} from "./app-settings-tips.ts"

describe("tip preset settings", () => {
  test("parses valid stored presets", () => {
    expect(parseTipPercentages("[5,10,15,20]")).toEqual([5, 10, 15, 20])
    expect(parseTipFixedAmounts("[2000,5000]")).toEqual([2000, 5000])
  })

  test("falls back to defaults for invalid stored presets", () => {
    expect(parseTipPercentages("[5,5]")).toEqual(defaultTipPercentages)
    expect(parseTipPercentages("[101]")).toEqual(defaultTipPercentages)
    expect(parseTipFixedAmounts("[0]")).toEqual(defaultTipFixedAmounts)
    expect(parseTipFixedAmounts("not json")).toEqual(defaultTipFixedAmounts)
  })

  test("serializes only valid presets", () => {
    expect(stringifyTipPercentages([5, 10])).toBe("[5,10]")
    expect(stringifyTipFixedAmounts([2500, 5000])).toBe("[2500,5000]")
  })

  test("rejects duplicate and excessive presets", () => {
    expect(() => stringifyTipPercentages([5, 5])).toThrow()
    expect(() => stringifyTipPercentages([1, 2, 3, 4, 5])).toThrow()
    expect(() => stringifyTipFixedAmounts([1000, 1000])).toThrow()
    expect(() => stringifyTipFixedAmounts([0])).toThrow()
  })
})
