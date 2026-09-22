import { describe, expect, test } from "vitest"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import {
  type ClaimedAmount,
  sumDistinctClaimedAmounts,
} from "@/core/modules/shared/claimed-amount.ts"
import type { Currency } from "@/core/modules/shared/schema.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"

/** A claim in the payment's own currency; the cross-currency cases override. */
const claimed = (fields: {
  readonly accountTransactionId: string
  readonly amount: number
  readonly currency?: Currency
  readonly paymentAmount?: number
  readonly paymentAmountSats?: number | null
}): ClaimedAmount => ({
  accountTransactionId: fields.accountTransactionId as AccountTransactionId,
  amount: fields.amount,
  currency: fields.currency ?? "CZK",
  paymentAmount: NonNegativeInteger(fields.paymentAmount ?? fields.amount),
  paymentCurrency: "CZK",
  paymentAmountSats:
    fields.paymentAmountSats === null || fields.paymentAmountSats === undefined
      ? null
      : NonNegativeInteger(fields.paymentAmountSats),
})

describe("sumDistinctClaimedAmounts", () => {
  test("sums distinct claimed transactions", () => {
    expect(
      sumDistinctClaimedAmounts([
        claimed({ accountTransactionId: "tx-cash", amount: 1_000 }),
        claimed({ accountTransactionId: "tx-lightning", amount: 1_000 }),
      ])
    ).toBe(2_000)
  })

  test("deduplicates the same transaction claimed more than once", () => {
    expect(
      sumDistinctClaimedAmounts([
        claimed({ accountTransactionId: "tx-cash", amount: 1_000 }),
        claimed({ accountTransactionId: "tx-cash", amount: 1_000 }),
      ])
    ).toBe(1_000)
  })

  test("returns zero for no claimed transactions", () => {
    expect(sumDistinctClaimedAmounts([])).toBe(0)
  })

  test("reads a satoshi settlement in the payment's currency", () => {
    // What the payment-level sum used to get wrong: 8 600 satoshis compared
    // against a 12 900 minor-unit payment. It happened to look "not
    // overpaid" only because satoshis are the smaller number at today's
    // rate — see the next case.
    expect(
      sumDistinctClaimedAmounts([
        claimed({
          accountTransactionId: "tx-lightning",
          amount: 8_600,
          currency: "BTC",
          paymentAmount: 12_900,
          paymentAmountSats: 8_600,
        }),
      ])
    ).toBe(12_900)
  })

  test("does not read one settlement as an excess when satoshis outnumber minor units", () => {
    // 129.00 CZK at a tenth of the earlier BTC price is 86 000 satoshis.
    // Compared raw against `payment.amount`, a single honest settlement
    // exceeds it and reads as a duplicate-settlement collision.
    const claimedSum = sumDistinctClaimedAmounts([
      claimed({
        accountTransactionId: "tx-lightning",
        amount: 86_000,
        currency: "BTC",
        paymentAmount: 12_900,
        paymentAmountSats: 86_000,
      }),
    ])

    expect(claimedSum).toBe(12_900)
    expect(claimedSum > 12_900).toBe(false)
  })

  test("still reads two satoshi settlements as an excess", () => {
    expect(
      sumDistinctClaimedAmounts([
        claimed({
          accountTransactionId: "tx-first",
          amount: 86_000,
          currency: "BTC",
          paymentAmount: 12_900,
          paymentAmountSats: 86_000,
        }),
        claimed({
          accountTransactionId: "tx-second",
          amount: 86_000,
          currency: "BTC",
          paymentAmount: 12_900,
          paymentAmountSats: 86_000,
        }),
      ])
    ).toBe(25_800)
  })

  test("counts nothing when there is no rate to convert by", () => {
    expect(
      sumDistinctClaimedAmounts([
        claimed({
          accountTransactionId: "tx-lightning",
          amount: 8_600,
          currency: "BTC",
          paymentAmount: 12_900,
          paymentAmountSats: null,
        }),
      ])
    ).toBe(0)
  })
})
