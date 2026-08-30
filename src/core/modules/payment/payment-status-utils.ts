import {
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
 * `canceledAt`/`expiresAt` — "paid" is read off the existence of an active
 * reconciliation claim instead. Precedence (first match wins) is
 * `canceled` > `paid` > `expired` > `pending`: an explicit cancellation
 * always wins the *display*, even in the rare case a claim also landed for
 * it (a CRDT merge race across devices, since `cancelPayment` itself
 * refuses to cancel an already-claimed payment on a single device); a claim
 * that arrives after `expiresAt` still counts as paid, since the money is
 * real regardless of the clock. See docs/bill-payment-states.md.
 */
export const derivePaymentStatus = ({
  canceledAt,
  expiresAt,
  hasActiveClaim,
  now,
}: {
  readonly canceledAt: TimestampMs | null
  readonly expiresAt: TimestampMs | null
  readonly hasActiveClaim: boolean
  readonly now: Date
}): PaymentStatus => {
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
