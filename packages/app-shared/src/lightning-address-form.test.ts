import { describe, expect, test } from "vitest"
import { parseLightningAddressInput } from "./lightning-address-form.ts"

describe("parseLightningAddressInput", () => {
  test("lowercases a valid address", () => {
    expect(parseLightningAddressInput(" Shop@Blink.sv ")).toEqual({
      ok: true,
      address: "shop@blink.sv",
    })
  })

  test("asks for an address when the field is empty", () => {
    expect(parseLightningAddressInput("  ")).toEqual({
      ok: false,
      errorKey: "settings.lightningAddress.address.required",
    })
  })

  test("rejects what is not an address", () => {
    expect(parseLightningAddressInput("shop.blink.sv")).toEqual({
      ok: false,
      errorKey: "settings.lightningAddress.address.invalid",
    })
  })
})
