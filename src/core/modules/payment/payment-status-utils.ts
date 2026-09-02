import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import {
  NonNegativeInteger,
  type TimestampMs,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

export type PaymentStatus = "canceled" | "paid" | "expired" | "pending"

/**
 * Default expiry window for a Lightning invoice prepared for a terminal
 * payment (15 minutes). Passed explicitly as `expirySeconds` whenever a
 * spark/Lightning payment method is prepared, so `payment.expiresAt` is
 * always populated for it — without an explicit value here, the invoice
 * would still expire (the Spark SDK applies its own default), but this
 * app's `expiresAt`/`derivePaymentStatus`/bill-lock machinery would never
 * find out, since `computePaymentExpiresAt` only stores what it's given.
 */
export const DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS = 900

/**
 * Derives a payment's display status. No status is stored beyond
 * `canceledAt`/`confirmedPaidAt`/`expiresAt` — "paid" is normally read off
 * the existence of an active reconciliation claim instead. Precedence (first
 * match wins) is `confirmedPaidAt` > `canceled` > `paid` > `expired` >
 * `pending`:
 *
 * - An explicit cancellation normally wins the *display* over a claim, even
 *   in the rare case a claim also landed for it (a CRDT merge race across
 *   devices, since `cancelPayment` itself refuses to cancel an
 *   already-claimed payment on a single device).
 * - `confirmedPaidAt` is staff's explicit resolution of exactly that
 *   collision (see `confirmPaymentPaidDespiteCancellation`) and therefore
 *   outranks `canceled` — it only ever gets set once a claim already exists,
 *   so it never lets a payment display as paid without money behind it.
 * - A claim that arrives after `expiresAt` still counts as paid, since the
 *   money is real regardless of the clock.
 *
 * See docs/bill-payment-states.md.
 */
export const derivePaymentStatus = ({
  canceledAt,
  confirmedPaidAt,
  expiresAt,
  hasActiveClaim,
  now,
}: {
  readonly canceledAt: TimestampMs | null
  readonly confirmedPaidAt: TimestampMs | null
  readonly expiresAt: TimestampMs | null
  readonly hasActiveClaim: boolean
  readonly now: Date
}): PaymentStatus => {
  if (confirmedPaidAt !== null) return "paid"
  if (canceledAt !== null) return "canceled"
  if (hasActiveClaim) return "paid"
  if (expiresAt !== null && now.getTime() > expiresAt) return "expired"
  return "pending"
}

/**
 * Computes a payment's `expiresAt` from a payment method's own expiry
 * window (e.g. a Lightning invoice's `expirySeconds`). `undefined` (no
 * expiry window given, e.g. cash or IBAN) maps to `null` — the payment
 * never expires on its own.
 */
export const computePaymentExpiresAt = (
  now: Date,
  expirySeconds: number | undefined
): TimestampMs | null =>
  expirySeconds === undefined
    ? null
    : TimestampMsSchema.decode(now.getTime() + expirySeconds * 1000)

/**
 * Sums the amounts of every distinct account transaction actively claimed
 * against a single payment, deduplicated by transaction id. A payment
 * normally has exactly one, but can end up with more than one for two very
 * different reasons: a genuine split settlement across methods (e.g. part
 * cash, part manually-reconciled bank transfer) that together add up to the
 * payment's own amount, or a CRDT merge race where two offline devices each
 * independently settle the *same* full amount through a different channel —
 * see `derivePaymentHasExcessSettlement`. See docs/bill-payment-states.md.
 */
export const calculatePaymentClaimedSum = (
  claimedTransactions: ReadonlyArray<{
    readonly accountTransactionId: AccountTransactionId
    readonly amount: number
  }>
): NonNegativeInteger => {
  const uniqueByTransactionId = new Map(
    claimedTransactions.map((transaction) => [
      transaction.accountTransactionId,
      transaction.amount,
    ])
  )

  return NonNegativeInteger(
    [...uniqueByTransactionId.values()].reduce((sum, amount) => sum + amount, 0)
  )
}

/**
 * Whether a payment has been claimed for more than its own `amount` — the
 * duplicate-settlement collision (see `payment.ts`'s `excessAcknowledgedAt`
 * doc comment) — and staff hasn't yet acknowledged it. Unlike the
 * canceled+claimed collision, this doesn't change `derivePaymentStatus`'s
 * result (the payment is unambiguously `paid`); it's a separate, additive
 * warning about the *amount* rather than the status. See
 * docs/bill-payment-states.md.
 */
export const derivePaymentHasExcessSettlement = ({
  amount,
  excessAcknowledgedAt,
  claimedSum,
}: {
  readonly amount: NonNegativeInteger
  readonly excessAcknowledgedAt: TimestampMs | null
  readonly claimedSum: NonNegativeInteger
}): boolean => excessAcknowledgedAt === null && claimedSum > amount
