import { MintUrlSchema } from "@payky/core/modules/cashu/cashu-types"
import { describe, expect, it } from "vitest"
import { type CashuTokenArrival, cashuArrivalMessage } from "./cashu-arrival.ts"

const arrival = (patch: Partial<CashuTokenArrival>): CashuTokenArrival => ({
  mintUrl: MintUrlSchema.parse("https://mint.example"),
  amount: 100,
  fee: null,
  state: "receiving",
  failure: null,
  ...patch,
})

describe("cashuArrivalMessage", () => {
  it("never calls a token from an untrusted mint received", () => {
    expect(cashuArrivalMessage(arrival({ state: "untrustedMint" })).key).toBe(
      "paymentWait.cashu.arrival.untrustedMint"
    )
  })

  it("names the failure, or the mint's rejection when none is known", () => {
    expect(
      cashuArrivalMessage(
        arrival({ state: "failed", failure: "AmountConsumedByFee" })
      ).key
    ).toBe("paymentWait.cashu.failure.fee")
    expect(cashuArrivalMessage(arrival({ state: "failed" })).key).toBe(
      "paymentWait.cashu.failure.mintRejected"
    )
  })

  it("says when another wallet received the token first", () => {
    expect(
      cashuArrivalMessage(arrival({ state: "receivedElsewhere" })).key
    ).toBe("paymentWait.cashu.arrival.receivedElsewhere")
  })

  it("says when another Payky device is receiving the token", () => {
    expect(
      cashuArrivalMessage(arrival({ state: "receivingElsewhere" })).key
    ).toBe("paymentWait.cashu.arrival.receivingElsewhere")
  })

  it("mentions the fee only when there is one", () => {
    expect(cashuArrivalMessage(arrival({ fee: 0 })).key).toBe(
      "paymentWait.cashu.arrival.receiving"
    )
    expect(cashuArrivalMessage(arrival({ fee: 2 })).key).toBe(
      "paymentWait.cashu.arrival.withFee"
    )
  })
})
