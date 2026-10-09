import { describe, expect, test } from "vitest"
import { BitcoinAddress, FiatCurrency } from "@/core/modules/shared/schema.ts"
import type {
  OnchainWithdrawalQuote,
  SupportedWithdrawDestination,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import {
  draftAmountSats,
  initialWithdrawState,
  withdrawReducer,
} from "./withdraw-flow.ts"

describe("draftAmountSats", () => {
  const noRate = { rate: null, currency: FiatCurrency.CZK }
  const czk = { rate: 2_000_000, currency: FiatCurrency.CZK }

  test("takes whole sats as typed", () => {
    expect(draftAmountSats({ amount: "1500", unit: "sats" }, noRate)).toBe(1500)
  })

  test("refuses fractional or empty sats", () => {
    expect(draftAmountSats({ amount: "1.5", unit: "sats" }, noRate)).toBeNull()
    expect(draftAmountSats({ amount: " ", unit: "sats" }, noRate)).toBeNull()
    expect(draftAmountSats({ amount: "1e3", unit: "sats" }, noRate)).toBeNull()
  })

  test("converts fiat with a comma at the rate", () => {
    // 2 000 000 CZK per BTC: 10 CZK is 500 sats.
    expect(draftAmountSats({ amount: "10,00", unit: "fiat" }, czk)).toBe(500)
  })

  test("refuses fiat with more fraction digits than the currency has", () => {
    expect(draftAmountSats({ amount: "10.001", unit: "fiat" }, czk)).toBeNull()
  })

  test("needs a rate for fiat", () => {
    expect(draftAmountSats({ amount: "10", unit: "fiat" }, noRate)).toBeNull()
  })
})

describe("withdrawReducer exit speed", () => {
  const onchainAddress = BitcoinAddress(
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
  )
  const quote = (availableSats: number): OnchainWithdrawalQuote => ({
    kind: "onchain",
    onchainAddress,
    availableSats,
    amountSats: availableSats,
    withdrawAll: true,
    feeQuote: {
      id: "fee-quote-1",
      expiresAt: "2026-06-05T12:05:00.000Z",
      fast: { userFeeSats: 300, l1BroadcastFeeSats: 500, totalFeeSats: 800 },
      medium: { userFeeSats: 200, l1BroadcastFeeSats: 300, totalFeeSats: 500 },
      slow: { userFeeSats: 100, l1BroadcastFeeSats: 150, totalFeeSats: 250 },
    },
  })
  const request = {
    destination: { kind: "onchain", address: onchainAddress },
    amountSats: undefined,
  } satisfies {
    destination: SupportedWithdrawDestination
    amountSats: undefined
  }
  const open = (availableSats: number) =>
    withdrawReducer(initialWithdrawState, {
      type: "OPEN_REVIEW",
      request,
      quote: quote(availableSats),
    })

  test("opens on medium when its fee leaves the minimum", () => {
    expect(open(10_500)).toMatchObject({ exitSpeed: "medium" })
  })

  test("falls back to slow when medium's fee would push withdraw-all under the minimum", () => {
    expect(open(10_400)).toMatchObject({ exitSpeed: "slow" })
  })

  test("a new quote moves an unavailable speed to slow", () => {
    const fast = withdrawReducer(open(20_000), {
      type: "SET_EXIT_SPEED",
      exitSpeed: "fast",
    })
    expect(
      withdrawReducer(fast, { type: "REQUOTED", quote: quote(10_500) })
    ).toMatchObject({ exitSpeed: "slow" })
  })
})
