import { describe, expect, it } from "vitest"
import { addTipFixedAmount, addTipPercentage } from "./tip-presets.ts"

describe("addTipPercentage", () => {
  it("adds a whole percentage", () => {
    expect(addTipPercentage([5], " 10 ")).toEqual({
      ok: true,
      presets: [5, 10],
    })
  })

  it("refuses 0, above 100, text, duplicates and a fifth preset", () => {
    for (const input of ["0", "101", "x", "1.5", ""]) {
      expect(addTipPercentage([], input)).toEqual({
        ok: false,
        errorKey: "settings.tips.percentages.invalid",
      })
    }
    expect(addTipPercentage([5], "5")).toMatchObject({
      errorKey: "settings.tips.percentages.duplicate",
    })
    expect(addTipPercentage([1, 2, 3, 4], "5")).toMatchObject({
      errorKey: "settings.tips.percentages.maximum",
    })
  })
})

describe("addTipFixedAmount", () => {
  it("stores the amount in minor units", () => {
    expect(addTipFixedAmount([2000], "12,5", "CZK")).toEqual({
      ok: true,
      presets: [2000, 1250],
    })
  })

  it("refuses unreadable, duplicate and a fifth amount", () => {
    expect(addTipFixedAmount([], "abc", "CZK")).toMatchObject({
      errorKey: "settings.tips.fixedAmounts.invalid",
    })
    expect(addTipFixedAmount([2000], "20", "CZK")).toMatchObject({
      errorKey: "settings.tips.fixedAmounts.duplicate",
    })
    expect(addTipFixedAmount([1, 2, 3, 4], "20", "CZK")).toMatchObject({
      errorKey: "settings.tips.fixedAmounts.maximum",
    })
  })
})
