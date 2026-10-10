import { describe, expect, test } from "vitest"

import { parseScannedBitcoinAddress } from "./bitcoin-uri-utils.ts"

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

  test("reads the amount as exact sats, without floating point", () => {
    expect(
      parseScannedBitcoinAddress(
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00000001"
      )
    ).toMatchObject({ amountSats: 1 })
  })

  test.each([
    ["more digits than sats", "0.000000004"],
    ["an exponent", "1e-3"],
    ["a comma", "0,001"],
    ["zero", "0"],
  ])("refuses an amount with %s", (_, amount) => {
    expect(
      parseScannedBitcoinAddress(
        `bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=${amount}`
      )
    ).toBeNull()
  })

  test("refuses a URI with a req- parameter, but not an unknown optional one", () => {
    const uri = "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
    expect(
      parseScannedBitcoinAddress(`${uri}?req-somethingyoudontunderstand=1`)
    ).toBeNull()
    expect(parseScannedBitcoinAddress(`${uri}?somethingelse=1`)).toMatchObject({
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    })
  })

  test("returns the lightning parameter", () => {
    expect(
      parseScannedBitcoinAddress(
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?lightning=lnbc1abc"
      )
    ).toMatchObject({ lightning: "lnbc1abc" })
  })

  test("lowers an upper-case bech32 address, as QR codes carry it", () => {
    expect(
      parseScannedBitcoinAddress(
        "BITCOIN:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ?amount=0.0001"
      )
    ).toEqual({
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      amountSats: 10_000,
      lightning: undefined,
    })
  })

  test("leaves the case of base58 and mixed-case addresses alone", () => {
    expect(
      parseScannedBitcoinAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")
    ).toEqual({ address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2" })
    expect(
      parseScannedBitcoinAddress("bc1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ")
    ).toEqual({ address: "bc1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ" })
  })
})
