import { parseWithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { describe, expect, test } from "vitest"
import {
  describeDestination,
  isPayableDestination,
} from "./withdraw-destination.ts"

const address = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
const describe_ = (raw: string, method: "spark" | "cashu") =>
  describeDestination(raw, parseWithdrawDestination(raw), method)

describe("describeDestination", () => {
  test("says nothing about an empty or half-typed destination", () => {
    expect(describe_("", "spark")).toEqual({ hint: null, error: null })
    expect(describe_("jo", "spark")).toEqual({ hint: null, error: null })
  })

  test("hints what an address is, and refuses a Spark destination", () => {
    expect(describe_(address, "spark")).toEqual({
      hint: "withdraw.destination.kind.onchain",
      error: null,
    })
    expect(describe_("pay@example.com", "spark").hint).toBe(
      "withdraw.destination.kind.lightningAddress"
    )
  })

  test("a Cashu melt cannot pay on-chain", () => {
    expect(describe_(address, "cashu")).toEqual({
      hint: null,
      error: "withdraw.cashu.error.onchain",
    })
    expect(isPayableDestination(address, "cashu")).toBe(false)
    expect(isPayableDestination(address, "spark")).toBe(true)
  })
})
