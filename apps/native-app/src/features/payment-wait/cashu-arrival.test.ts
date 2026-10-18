import type { CashuTokenArrival } from "@payky/core/cashu/cashu-token-listener"
import { MintUrlSchema } from "@payky/core/modules/cashu/cashu-types"
import { describe, expect, it } from "vitest"
import { cashuArrivalMessage } from "./cashu-arrival.ts"

const arrival = (patch: Partial<CashuTokenArrival>): CashuTokenArrival => ({
  mint: MintUrlSchema.parse("https://mint.example"),
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
      cashuArrivalMessage(arrival({ state: "failed", failure: "ProofsSpent" }))
        .key
    ).toBe("paymentWait.cashu.failure.spent")
    expect(cashuArrivalMessage(arrival({ state: "failed" })).key).toBe(
      "paymentWait.cashu.failure.mintRejected"
    )
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
