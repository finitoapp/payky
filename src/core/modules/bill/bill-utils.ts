import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  NonNegativeInteger,
  type TimestampMs,
} from "@/core/modules/shared/schema.ts"

export type BillCoverage = "paid" | "underpaid" | "overpaid"

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
 * Sums the non-tip portion (`amount - tipAmount`) of every claimed payment,
 * deduplicated by payment id — a single payment can carry more than one
 * active claim (e.g. `markPaymentPaidCash` claimed against two accounts),
 * and its amount must only count once toward the bill's coverage.
 */
export const calculateClaimedSum = (
  claimedPayments: ReadonlyArray<{
    readonly id: PaymentId
    readonly amount: NonNegativeInteger
    readonly tipAmount: NonNegativeInteger
  }>
): NonNegativeInteger => {
  const uniqueById = new Map(
    claimedPayments.map((payment) => [payment.id, payment])
  )

  return NonNegativeInteger(
    [...uniqueById.values()].reduce(
      (sum, payment) => sum + (payment.amount - payment.tipAmount),
      0
    )
  )
}

/**
 * Turns a list of claimed-payment rows into a `Set` of their ids — shared by
 * `isBillLocked` (`bill-actions.ts`) and `usePendingPayments` (the reactive
 * equivalent) so the "which payments are claimed" adaptation step isn't
 * duplicated between the Task and hook versions.
 */
export const claimedPaymentIdSet = (
  claimedPayments: ReadonlyArray<{ readonly id: PaymentId }>
): ReadonlySet<PaymentId> =>
  new Set(claimedPayments.map((payment) => payment.id))

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
