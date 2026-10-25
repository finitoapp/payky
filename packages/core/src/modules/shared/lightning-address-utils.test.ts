import { describe, expect, test } from "vitest"
import { parseLightningAddress } from "./lightning-address-utils.ts"

describe("parseLightningAddress", () => {
  test("trims and lowercases an address", () => {
    expect(parseLightningAddress("  Shop@GetAlby.com ")).toBe(
      "shop@getalby.com"
    )
  })

  test("drops a lightning: scheme", () => {
    expect(parseLightningAddress("lightning:shop@blink.sv")).toBe(
      "shop@blink.sv"
    )
  })

  test("rejects what is not an address", () => {
    expect(parseLightningAddress("shop")).toBeNull()
    expect(parseLightningAddress("shop@localhost")).toBeNull()
    expect(parseLightningAddress("lnbc10n1…")).toBeNull()
  })
})
