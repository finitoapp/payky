import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { describe, expect, it } from "vitest"
import { readCashReceived } from "./cash-received.ts"

const read = (edited: string | null) =>
  readCashReceived({
    amount: NonNegativeInteger(12345),
    currency: "CZK",
    edited,
  })

describe("readCashReceived", () => {
  it("starts at the cash-rounded charge", () => {
    expect(read(null)).toMatchObject({
      text: "123",
      leastReceived: 12300,
      receivedAmount: 12300,
    })
  })

  it("accepts more cash than the charge", () => {
    expect(read("200").receivedAmount).toBe(20000)
  })

  it("rejects an underpayment and unreadable input", () => {
    expect(read("120").receivedAmount).toBeNull()
    expect(read("abc").receivedAmount).toBeNull()
    expect(read("").receivedAmount).toBeNull()
  })
})
