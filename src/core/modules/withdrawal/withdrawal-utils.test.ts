import { describe, expect, test } from "vitest"
import { computeTotalDebitedSats } from "./withdrawal-utils.ts"

describe("computeTotalDebitedSats", () => {
  test("returns the full available balance when withdrawing all", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: true,
        availableSats: 5000,
        feeSats: 200,
      })
    ).toBe(5000)
  })

  test("returns the requested amount plus fee for a partial withdrawal", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: false,
        availableSats: 5000,
        feeSats: 200,
      })
    ).toBe(1200)
  })

  test("adds a zero fee without changing the requested amount", () => {
    expect(
      computeTotalDebitedSats({
        amountSats: 1000,
        withdrawAll: false,
        availableSats: 5000,
        feeSats: 0,
      })
    ).toBe(1000)
  })
})
