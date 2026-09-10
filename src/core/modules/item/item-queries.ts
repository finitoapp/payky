import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

/**
 * Only the item snapshots referenced by one bill's lines — what
 * `loadCalculatedBillLineSummaries` and `useBillLineSummaries` read.
 *
 * There is deliberately no whole-table `item` query to reach for instead.
 * `item` rows are content-addressed snapshots that are never deleted, so the
 * table grows with every distinct name/price a POS has ever sold, and reading
 * all of it per bill made every cart guard, every added line, and every entry
 * of a bill list scan that entire history.
 *
 * `distinct` because one snapshot is normally shared by several lines (and by
 * several bills): the join would otherwise return it once per line.
 */
export const itemsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("item")
      .innerJoin("billLine", "billLine.itemId", "item.id")
      .selectAll("item")
      .distinct()
      .where("billLine.billId", "=", billId)
      .where("item.name", "is not", null)
      .where("item.currency", "is not", null)
      .where("item.unitAmount", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
      }>()
  )

/**
 * Only the item snapshots referenced by one payment's frozen `paymentLine`
 * rows — the payment-side counterpart to `itemsByBillIdQuery`.
 *
 * Deliberately not scoped through the bill: a `paymentLine` snapshot outlives
 * the bill line it was taken from (see `snapshotBillLinesForPayment`), so the
 * item a payment was made for may no longer be on the bill at all. That case
 * is the whole point of `deriveBillLineSummaryDiff` — scoping this by `billId`
 * would drop exactly the rows it needs to report as removed.
 */
export const itemsByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("item")
      .innerJoin("paymentLine", "paymentLine.itemId", "item.id")
      .selectAll("item")
      .distinct()
      .where("paymentLine.paymentId", "=", paymentId)
      .where("item.name", "is not", null)
      .where("item.currency", "is not", null)
      .where("item.unitAmount", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
      }>()
  )
