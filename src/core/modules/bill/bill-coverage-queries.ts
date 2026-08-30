import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "./bill-types.ts"

/**
 * Every payment for a bill that has an active reconciliation claim — money
 * that has actually arrived — regardless of that payment's own
 * canceled/expired display status (see `derivePaymentStatus`). A payment can
 * appear more than once here if it carries more than one active claim; sum
 * with `calculateClaimedSum`, which deduplicates by payment id. See
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
