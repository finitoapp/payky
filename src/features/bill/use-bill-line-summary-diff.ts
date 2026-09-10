import { useMemo } from "react"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  type BillLineSummaryDiff,
  deriveBillLineSummaryDiff,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import { itemsByPaymentIdQuery } from "@/core/modules/item/item-queries.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { paymentLinesByPaymentIdQuery } from "@/core/modules/payment-line/payment-line-queries.ts"
import { paymentLinesToBillLineSummaries } from "@/core/modules/payment-line/payment-line-utils.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Compares the bill-line snapshot frozen when `paymentId` was created (see
 * `snapshotBillLinesForPayment`) against the bill's current line-item
 * summaries. `null` when there is no snapshot to compare against — the
 * payment was created before this feature existed (the common case for any
 * pre-existing payment) — see `paymentLinesByPaymentIdQuery`'s doc comment.
 */
export function useBillLineSummaryDiff(
  paymentId: PaymentId,
  billId: BillId
): BillLineSummaryDiff | null {
  const current = useBillLineSummaries(billId)
  const paymentLineQuery = useMemo(
    () => paymentLinesByPaymentIdQuery(paymentId),
    [paymentId]
  )
  const { data: paymentLineRows } = useEvoluQuery(paymentLineQuery)
  // Scoped to the payment, not the bill: a frozen `paymentLine` can point at
  // an item the bill no longer carries, which is exactly what this diff is
  // here to report.
  const itemQuery = useMemo(() => itemsByPaymentIdQuery(paymentId), [paymentId])
  const { data: itemRows } = useEvoluQuery(itemQuery)

  return useMemo(() => {
    if (paymentLineRows.length === 0) return null
    const expected = paymentLinesToBillLineSummaries(paymentLineRows, itemRows)
    return deriveBillLineSummaryDiff(expected, current)
  }, [paymentLineRows, itemRows, current])
}
