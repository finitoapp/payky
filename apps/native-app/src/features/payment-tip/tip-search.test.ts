import { describe, expect, it } from "vitest"
import { parseTipSearch } from "./tip-search.ts"

describe("parseTipSearch", () => {
  it("reads the amount and currency of a charge", () => {
    expect(parseTipSearch({ amount: "12345", currency: "CZK" })).toEqual({
      amount: 12345,
      currency: "CZK",
      billId: null,
    })
  })

  it("is null without a usable amount or currency", () => {
    expect(parseTipSearch({ currency: "CZK" })).toBeNull()
    expect(parseTipSearch({ amount: "0", currency: "CZK" })).toBeNull()
    expect(parseTipSearch({ amount: "1.5", currency: "CZK" })).toBeNull()
    expect(parseTipSearch({ amount: "100", currency: "XXX" })).toBeNull()
  })

  it("drops a broken billId instead of failing", () => {
    expect(
      parseTipSearch({ amount: "100", currency: "CZK", billId: "nope" })
    ).toEqual({ amount: 100, currency: "CZK", billId: null })
  })
})
