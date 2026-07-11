import { describe, expect, test } from "vitest"
import {
  formatAddressGroups,
  parseScannedBitcoinAddress,
} from "./withdraw-utils.ts"

describe("parseScannedBitcoinAddress", () => {
  test("returns a bare address unchanged", () => {
    expect(
      parseScannedBitcoinAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")
    ).toEqual({ address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" })
  })

  test("extracts the address and amount from a BIP21 URI", () => {
    expect(
      parseScannedBitcoinAddress(
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0001&label=Test"
      )
    ).toEqual({
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      amountSats: 10_000,
    })
  })

  test("returns just the address when the URI has no amount", () => {
    expect(
      parseScannedBitcoinAddress(
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
      )
    ).toEqual({
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      amountSats: undefined,
    })
  })

  test("trims surrounding whitespace", () => {
    expect(
      parseScannedBitcoinAddress("  1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2  ")
    ).toEqual({ address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2" })
  })
})

describe("formatAddressGroups", () => {
  test("preserves exact casing when grouping Base58 addresses for review", () => {
    const address = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"

    expect(formatAddressGroups(address)).toBe(
      "1BvB MSEY stWe tqTF n5Au 4m4G Fg7x JaNV N2"
    )
  })
})
