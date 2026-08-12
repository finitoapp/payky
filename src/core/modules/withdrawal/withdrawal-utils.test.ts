import { describe, expect, test } from "vitest"
import {
  computeTotalDebitedSats,
  isValidBitcoinAddress,
} from "./withdrawal-utils.ts"

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
