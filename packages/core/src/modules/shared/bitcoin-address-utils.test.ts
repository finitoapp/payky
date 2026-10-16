import { describe, expect, test } from "vitest"
import { isValidBitcoinAddress } from "./bitcoin-address-utils.ts"

describe("isValidBitcoinAddress", () => {
  test("accepts a legacy P2PKH address", () => {
    expect(isValidBitcoinAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(
      true
    )
  })

  test("accepts a P2SH address", () => {
    expect(isValidBitcoinAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(
      true
    )
  })

  test("accepts a bech32 P2WPKH address", () => {
    expect(
      isValidBitcoinAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")
    ).toBe(true)
  })

  test("rejects an empty or blank string", () => {
    expect(isValidBitcoinAddress("")).toBe(false)
    expect(isValidBitcoinAddress("   ")).toBe(false)
  })

  test("rejects non-address text", () => {
    expect(isValidBitcoinAddress("not-an-address")).toBe(false)
  })

  test("rejects a testnet address on mainnet", () => {
    expect(
      isValidBitcoinAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")
    ).toBe(false)
  })

  test("rejects a legacy address with a corrupted checksum", () => {
    expect(isValidBitcoinAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toBe(
      false
    )
  })
})
