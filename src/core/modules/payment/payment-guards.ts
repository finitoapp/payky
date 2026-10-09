/**
 * The read-and-validate half of the payment module, as `bill-guards.ts` is for
 * bills: what state a payment is in and whether the caller may act on it,
 * without writing anything. `payment-actions.ts` and `refund-actions.ts`
 * compose these, so every guard reads "has money arrived" the same way.
 */

import { err, ok, type Task } from "@evolu/common"

import type { DateDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { PaymentRow } from "./payment.ts"
import {
  createPaymentNotPayableError,
  type PaymentNotPayableError,
} from "./payment-errors.ts"
import { paymentClaimsQuery } from "./payment-queries.ts"
import {
  derivePaymentStatus,
  type PaymentStatus,
} from "./payment-status-utils.ts"
import type { PaymentId } from "./payment-types.ts"

/**
 * Whether money arrived for this payment. Read through `paymentClaimsQuery`,
 * which skips a claim whose transaction was deleted: counting it here made
 * `cancelPayment` refuse a payment every screen showed as pending, leaving its
 * bill locked with no way out.
 */
export const loadPaymentHasActiveClaim =
  (paymentId: PaymentId): Task<boolean, never, EvoluDep> =>
  async (run) =>
    ok(
      (await run.deps.evolu.loadQuery(paymentClaimsQuery(paymentId))).length > 0
    )

/** The payment's derived status (docs/bill-payment-states.md). */
export const loadPaymentStatus =
  (
    payment: Pick<
      PaymentRow,
      "id" | "canceledAt" | "confirmedPaidAt" | "expiresAt"
    >
  ): Task<PaymentStatus, never, EvoluDep & DateDep> =>
  async (run) => {
    const hasActiveClaim = await run.ok(loadPaymentHasActiveClaim(payment.id))
    return ok(
      derivePaymentStatus({
        canceledAt: payment.canceledAt,
        confirmedPaidAt: payment.confirmedPaidAt,
        expiresAt: payment.expiresAt,
        hasActiveClaim,
        now: run.deps.date.now(),
      })
    )
  }

/** Refuses a payment that is no longer waiting for money. */
export const requirePayablePayment =
  (
    payment: Pick<
      PaymentRow,
      "id" | "canceledAt" | "confirmedPaidAt" | "expiresAt"
    >
  ): Task<void, PaymentNotPayableError, EvoluDep & DateDep> =>
  async (run) => {
    const status = await run.ok(loadPaymentStatus(payment))
    if (status !== "pending") {
      return err(createPaymentNotPayableError({ id: payment.id, status }))
    }
    return ok()
  }
