import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "./bill-types.ts"

/**
 * Every payment for a bill that has an active reconciliation claim — money
 * that has actually arrived — regardless of that payment's own
 * canceled/expired display status (see `derivePaymentStatus`). A payment can
 * appear more than once here if it carries more than one active claim.
 *
 * This only tells you *which* payments are claimed (used to build a
 * `Set<PaymentId>` via `claimedPaymentIdSet`, e.g. for the pending-payment
 * lock) — it can't tell you *how much* has actually been claimed, since it
 * doesn't carry the underlying transaction amounts. For coverage math, use
 * `claimedTransactionsByBillIdQuery` with `calculateClaimedSum` instead. See
 * docs/bill-payment-states.md.
 */
export const claimedPaymentsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .innerJoin("reconciliationClaim", (join) =>
        join
          .onRef("reconciliationClaim.paymentId", "=", "payment.id")
          .on("reconciliationClaim.isDeleted", "is not", 1)
      )
      .select(["payment.id", "payment.amount", "payment.tipAmount"])
      .where("payment.billId", "=", billId)
      .where("payment.isDeleted", "is not", 1)
      .where("payment.amount", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )

/**
 * Every distinct account transaction actively claimed against a payment of
 * a bill, one row per claim — the basis for `calculateClaimedSum`, which
 * dedupes by transaction id and sums per payment (minus tip, once per
 * payment). Unlike `claimedPaymentsByBillIdQuery`, this carries the real
 * transaction `amount` rather than the payment's nominal one, so it stays
 * correct when a payment ends up claimed for more (or, mid-split, less)
 * than its own amount — see `calculatePaymentClaimedSum`'s doc comment in
 * `payment-status-utils.ts`. See docs/bill-payment-states.md.
 */
export const claimedTransactionsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .innerJoin("reconciliationClaim", (join) =>
        join
          .onRef("reconciliationClaim.paymentId", "=", "payment.id")
          .on("reconciliationClaim.isDeleted", "is not", 1)
      )
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .select([
        "payment.id as paymentId",
        "payment.tipAmount",
        "reconciliationClaim.accountTransactionId",
        "accountTransaction.amount",
      ])
      .where("payment.billId", "=", billId)
      .where("payment.isDeleted", "is not", 1)
      .where("payment.tipAmount", "is not", null)
      .where("reconciliationClaim.accountTransactionId", "is not", null)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransaction.amount", "is not", null)
      .$narrowType<{
        tipAmount: KyselyNotNull
        accountTransactionId: KyselyNotNull
        amount: KyselyNotNull
      }>()
  )

/**
 * Every non-deleted payment for a bill, with just the fields needed to
 * derive its display status (`derivePaymentStatus`) — used to determine
 * whether the bill currently has a live (pending) payment locking it for
 * edits. See docs/bill-payment-states.md.
 */
export const paymentsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select(["payment.id", "payment.canceledAt", "payment.expiresAt"])
      .where("payment.billId", "=", billId)
      .where("payment.isDeleted", "is not", 1)
  )
