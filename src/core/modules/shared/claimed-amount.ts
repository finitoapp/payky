import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { Currency, FiatCurrency } from "@/core/modules/shared/schema.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"

/**
 * The money on one account transaction claimed against a payment, together
 * with everything needed to read it in that payment's currency.
 *
 * `amount` is denominated in the *transaction's* currency, which is not
 * always the payment's: a Lightning/Spark settlement records satoshis
 * against a payment charged in fiat. `paymentAmount` and `paymentAmountSats`
 * are the two sides of that same charge, so the ratio between them is the
 * exchange rate locked when the invoice was created.
 */
export interface ClaimedAmount {
  readonly accountTransactionId: AccountTransactionId
  readonly amount: number
  readonly currency: Currency
  readonly paymentAmount: NonNegativeInteger
  readonly paymentCurrency: FiatCurrency
  /** Only a BTC payment carries one; `null` for every other method. */
  readonly paymentAmountSats: NonNegativeInteger | null
}

/**
 * A claimed transaction's value in its payment's currency. Summing raw
 * amounts across currencies is the bug this exists to prevent: 8 600
 * satoshis against a 129.00 CZK bill read as 8 600 minor units and left the
 * bill underpaid forever.
 *
 * Scaling by the payment's own fiat-per-satoshi ratio rather than by
 * `paymentBtc.exchangeRate` is deliberate: a settlement of exactly
 * `paymentAmountSats` then contributes exactly `paymentAmount`, with no
 * rounding drift. `deriveBillCoverage` compares for equality, so a single
 * minor unit of drift is the difference between `paid` and `underpaid`. A
 * partial or excess settlement scales proportionally, which is also what
 * keeps two claims on one payment from each counting as a full payment.
 */
export const toPaymentCurrencyAmount = (claimed: ClaimedAmount): number => {
  if (claimed.currency === claimed.paymentCurrency) return claimed.amount

  // No rate to convert with — a non-fiat transaction claimed against a
  // payment that never carried a satoshi amount, which only a manual claim
  // can produce. Counting nothing leaves the bill underpaid and visible to
  // staff; inventing a rate would close it on a number nobody computed.
  if (claimed.paymentAmountSats === null || claimed.paymentAmountSats === 0) {
    return 0
  }

  return Math.round(
    (claimed.amount * claimed.paymentAmount) / claimed.paymentAmountSats
  )
}

/**
 * Sums claimed transactions in their payment's currency, counting each
 * distinct account transaction once.
 *
 * Deduplicating by *transaction* id is the whole point: a payment can carry
 * more than one active claim, either as a genuine split settlement across
 * methods (part cash, part manually-reconciled bank transfer) that together
 * add up to its amount, or as a CRDT merge race where two offline devices
 * each independently settle the *same* full amount through a different
 * channel. Both are real money and neither claim is discarded, so what
 * arrived is the sum of the distinct transactions — not the payment's
 * nominal amount counted once regardless.
 *
 * Shared by the bill's coverage (`calculateClaimedSum`, which adds
 * per-payment tip handling on top) and the payment's own excess-settlement
 * check, so the two cannot drift apart on either the dedup rule or the
 * currency conversion. See docs/bill-payment-states.md.
 */
export const sumDistinctClaimedAmounts = (
  claims: ReadonlyArray<ClaimedAmount>
): NonNegativeInteger =>
  NonNegativeInteger(
    [
      ...new Map(
        claims.map((claim) => [claim.accountTransactionId, claim])
      ).values(),
    ].reduce((sum, claim) => sum + toPaymentCurrencyAmount(claim), 0)
  )
