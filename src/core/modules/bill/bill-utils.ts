import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { Currency, FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  NonNegativeInteger,
  type TimestampMs,
} from "@/core/modules/shared/schema.ts"

export type BillCoverage = "paid" | "underpaid" | "overpaid"

export type BillStatus = "open" | "closed" | "canceled"

/**
 * Derives a bill's display status, in precedence order (first match wins):
 * `confirmedClosedAt` > `canceledAt` > coverage > `open`. Mirrors
 * `derivePaymentStatus`'s shape and reasoning:
 *
 * - `confirmedClosedAt` is staff's explicit resolution of the
 *   canceled+funded collision (see `confirmBillClosedDespiteCancellation`)
 *   and outranks `canceledAt` on purpose, the same way
 *   `payment.confirmedPaidAt` outranks `payment.canceledAt`.
 * - `canceledAt` otherwise wins over coverage: an explicit discard is not
 *   silently undone just because a stray/late claim happens to cover the
 *   total (see docs/bill-payment-states.md).
 * - Coverage only counts as "closed" together with `hasActiveClaim` — a
 *   brand-new bill with no line items yet also has `billTotal === 0 ===
 *   claimedSum` (trivially "paid" by `deriveBillCoverage`'s own definition),
 *   but must stay `open`/editable until an actual payment has been claimed
 *   for it. Requiring at least one claim is what keeps that fresh-empty-cart
 *   case from reading as instantly `closed`.
 */
export const deriveBillStatus = ({
  canceledAt,
  confirmedClosedAt,
  hasActiveClaim,
  coverage,
}: {
  readonly canceledAt: TimestampMs | null
  readonly confirmedClosedAt: TimestampMs | null
  readonly hasActiveClaim: boolean
  readonly coverage: BillCoverage
}): BillStatus => {
  if (confirmedClosedAt !== null) return "closed"
  if (canceledAt !== null) return "canceled"
  return hasActiveClaim && coverage !== "underpaid" ? "closed" : "open"
}

/**
 * Compares what has actually been claimed as paid against a bill's
 * line-item total, independent of `bill.status`. See
 * docs/bill-payment-states.md.
 */
export const deriveBillCoverage = (
  billTotal: NonNegativeInteger,
  claimedSum: NonNegativeInteger
): BillCoverage => {
  if (claimedSum === billTotal) return "paid"
  return claimedSum < billTotal ? "underpaid" : "overpaid"
}

/**
 * One account transaction claimed against a payment, as the coverage
 * queries return it.
 *
 * `amount` is denominated in the *transaction's* currency, which is not
 * always the bill's: a Lightning/Spark settlement records satoshis
 * (`currency: "BTC"`) against a payment charged in fiat. `paymentAmount`
 * and `paymentAmountSats` are the two sides of that same charge, so the
 * ratio between them is the exchange rate locked when the invoice was
 * created — see `toPaymentCurrencyAmount`.
 */
export interface ClaimedTransaction {
  readonly paymentId: PaymentId
  readonly accountTransactionId: AccountTransactionId
  readonly amount: number
  readonly currency: Currency
  readonly tipAmount: NonNegativeInteger
  readonly paymentAmount: NonNegativeInteger
  readonly paymentCurrency: FiatCurrency
  /** Only a BTC payment carries one; `null` for every other method. */
  readonly paymentAmountSats: NonNegativeInteger | null
}

/**
 * A claimed transaction's value in its payment's (and therefore its
 * bill's) currency. Summing raw amounts across currencies is the bug this
 * exists to prevent: 8 600 satoshis against a 129.00 CZK bill read as
 * 8 600 minor units and left the bill underpaid forever.
 *
 * Scaling by the payment's own fiat-per-satoshi ratio rather than by
 * `paymentBtc.exchangeRate` is deliberate: a settlement of exactly
 * `paymentAmountSats` then contributes exactly `paymentAmount`, with no
 * rounding drift. `deriveBillCoverage` compares for equality, so a single
 * minor unit of drift is the difference between `paid` and `underpaid`.
 * A partial or excess settlement scales proportionally, which is also what
 * keeps two claims on one payment from each counting as a full payment.
 */
const toPaymentCurrencyAmount = (transaction: ClaimedTransaction): number => {
  if (transaction.currency === transaction.paymentCurrency) {
    return transaction.amount
  }

  // No rate to convert with — a non-fiat transaction claimed against a
  // payment that never carried a satoshi amount, which only a manual claim
  // can produce. Counting nothing leaves the bill underpaid and visible to
  // staff; inventing a rate would close it on a number nobody computed.
  if (
    transaction.paymentAmountSats === null ||
    transaction.paymentAmountSats === 0
  ) {
    return 0
  }

  return Math.round(
    (transaction.amount * transaction.paymentAmount) /
      transaction.paymentAmountSats
  )
}

/**
 * Sums, per payment, the non-tip portion of every distinct account
 * transaction actively claimed against it, then adds those per-payment
 * totals together. Every amount is first converted into the payment's own
 * currency (see `toPaymentCurrencyAmount`), so a Lightning settlement in
 * satoshis and a cash settlement in minor units can be added at all.
 *
 * Deduplicates by *transaction* id (not payment id) —
 * `calculatePaymentClaimedSum`'s doc comment explains why a payment can
 * carry more than one active claim (a genuine multi-method split, or a
 * CRDT merge race across two offline devices), and either way the real
 * money that arrived for it is the sum of its distinct transactions, not
 * its nominal `amount` counted once regardless of how much was actually
 * claimed. Tip is still subtracted only once per payment (it's an
 * attribute of the payment, not of any one transaction), and a payment
 * whose transactions still fall short of its tip (a partial, incomplete
 * split) contributes zero rather than a negative amount.
 */
export const calculateClaimedSum = (
  claimedTransactions: ReadonlyArray<ClaimedTransaction>
): NonNegativeInteger => {
  const uniqueTransactions = new Map(
    claimedTransactions.map((transaction) => [
      transaction.accountTransactionId,
      transaction,
    ])
  )

  // Gross and tip travel together per payment rather than in two parallel
  // maps: the tip is only meaningful against the gross it is subtracted from,
  // and keeping them apart made it possible to look one up without the other.
  //
  // Every row of a payment carries that payment's own `tipAmount`, joined from
  // the same `payment` row, so through either current query these values
  // always agree and the `max` below is whichever one they all are. Nothing
  // enforces that though — a widened join would break it silently — and
  // taking whichever row was read last would then be a coin flip in one of
  // two directions. Too small a tip inflates the claimed sum, and an inflated
  // sum can read a bill as covered while money is still missing. The largest
  // tip can only leave a bill looking *less* covered, which staff notice.
  const claimedByPayment = new Map<
    PaymentId,
    { readonly gross: number; readonly tip: NonNegativeInteger }
  >()
  for (const transaction of uniqueTransactions.values()) {
    const { paymentId, tipAmount } = transaction
    const claimed = claimedByPayment.get(paymentId)
    claimedByPayment.set(paymentId, {
      gross: (claimed?.gross ?? 0) + toPaymentCurrencyAmount(transaction),
      tip:
        claimed === undefined
          ? tipAmount
          : NonNegativeInteger(Math.max(claimed.tip, tipAmount)),
    })
  }

  return NonNegativeInteger(
    [...claimedByPayment.values()].reduce(
      (sum, { gross, tip }) => sum + Math.max(0, gross - tip),
      0
    )
  )
}

export interface BillHistoryItemSummary {
  readonly status: BillStatus
  /**
   * The canceled+funded collision from docs/bill-payment-states.md: the
   * bill was discarded, but its payments already cover its total —
   * `deriveBillStatus` still reads `canceled` until staff explicitly
   * resolves it via `confirmBillClosedDespiteCancellation`.
   */
  readonly hasCancellationCollision: boolean
  readonly billTotal: NonNegativeInteger
  readonly claimedSum: NonNegativeInteger
  readonly coverage: BillCoverage
}

/**
 * Combines a bill's `canceledAt`/`confirmedClosedAt`, its precomputed
 * `billTotal` (from `calculateBillLineSummaries`), and its claimed
 * transactions into the same derived status/coverage shape
 * `useBillStatus`/`useBillCoverage` compute per bill on the detail page —
 * reused by `latestBillsQuery`'s list rendering (`BillHistory`) so both
 * places agree on the same pure logic instead of duplicating it. See
 * docs/bill-payment-states.md.
 */
export const deriveBillHistoryItemSummary = ({
  canceledAt,
  confirmedClosedAt,
  billTotal,
  claimedTransactions,
}: {
  readonly canceledAt: TimestampMs | null
  readonly confirmedClosedAt: TimestampMs | null
  readonly billTotal: NonNegativeInteger
  readonly claimedTransactions: ReadonlyArray<ClaimedTransaction>
}): BillHistoryItemSummary => {
  const claimedSum = calculateClaimedSum(claimedTransactions)
  const coverage = deriveBillCoverage(billTotal, claimedSum)
  const hasActiveClaim = claimedTransactions.length > 0
  const status = deriveBillStatus({
    canceledAt,
    confirmedClosedAt,
    hasActiveClaim,
    coverage,
  })

  return {
    status,
    hasCancellationCollision:
      canceledAt !== null &&
      confirmedClosedAt === null &&
      hasActiveClaim &&
      coverage !== "underpaid",
    billTotal,
    claimedSum,
    coverage,
  }
}

/**
 * Which of a bill's payments count as settled, from its claimed *transaction*
 * rows — shared by `isBillLocked` (`bill-actions.ts`) and
 * `usePendingPayments` (the reactive equivalent) so the Task guard and the UI
 * lock can never answer this differently. That sharing is the point; see
 * `hasPendingPayment` below.
 *
 * The `paymentId` parameter is load-bearing, not incidental: payment rows key
 * their own id as `id`, so handing this the payments that merely *have* a
 * claim — the drift it exists to prevent — is a type error rather than a
 * plausible-looking set.
 *
 * Built from `claimedTransactionsByBillIdQuery` rather than
 * `claimedPaymentsByBillIdQuery`, i.e. from claims whose account transaction
 * is actually present. A claim on its own is not evidence that money arrived:
 * `calculateClaimedSum` cannot count a transaction that is not there, so
 * feeding the lock the looser "has any claim at all" reading let a bill read
 * `open` with coverage 0 while its payment still displayed as paid — and the
 * cart stayed editable underneath an outstanding payment, which is the one
 * thing the lock exists to prevent.
 *
 * The cost is a transient false lock during the sync window where a claim has
 * arrived from another device and its transaction has not. That resolves
 * itself, and errs towards keeping a cart still rather than letting it move
 * under a customer who is mid-payment.
 */
export const claimedPaymentIdSet = (
  claimedTransactions: ReadonlyArray<{ readonly paymentId: PaymentId }>
): ReadonlySet<PaymentId> =>
  new Set(claimedTransactions.map((transaction) => transaction.paymentId))

/**
 * The ids of every *live* payment attempt on a bill — one whose derived
 * status (see `derivePaymentStatus`) is `pending`. This is the basis of the
 * bill's editing lock: `editable = bill.status === "open" && !hasPendingPayment(...)`.
 * Nothing is stored for this — it is recomputed from the payment rows every
 * time, so the lock clears itself the moment the live payment resolves
 * (paid, canceled, or expires), with no separate "unlock" step. See
 * docs/bill-payment-states.md.
 */
export const derivePendingPaymentIds = (
  payments: ReadonlyArray<{
    readonly id: PaymentId
    readonly canceledAt: TimestampMs | null
    readonly expiresAt: TimestampMs | null
  }>,
  claimedPaymentIds: ReadonlySet<PaymentId>,
  now: Date
): ReadonlyArray<PaymentId> =>
  payments
    .filter(
      (payment) =>
        derivePaymentStatus({
          canceledAt: payment.canceledAt,
          // `confirmedPaidAt` can only ever be set once `canceledAt` already
          // is (see `confirmPaymentPaidDespiteCancellation`), and both of
          // those branches resolve to a non-"pending" status ahead of this
          // one — so passing `null` here can never change whether a bill
          // counts as locked. Not selected by this query on purpose, to
          // avoid widening it for a value that can't affect the result.
          confirmedPaidAt: null,
          expiresAt: payment.expiresAt,
          hasActiveClaim: claimedPaymentIds.has(payment.id),
          now,
        }) === "pending"
    )
    .map((payment) => payment.id)

export const hasPendingPayment = (
  payments: ReadonlyArray<{
    readonly id: PaymentId
    readonly canceledAt: TimestampMs | null
    readonly expiresAt: TimestampMs | null
  }>,
  claimedPaymentIds: ReadonlySet<PaymentId>,
  now: Date
): boolean =>
  derivePendingPaymentIds(payments, claimedPaymentIds, now).length > 0
