import { useMemo } from "react"

import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  type BillCoverage,
  calculateClaimedSum,
  deriveBillCoverage,
} from "@/core/modules/bill/bill-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of `loadBillCoverage`: subscribes to the bill's line
 * ledger and its claimed payments, then re-derives paid/underpaid/overpaid
 * on every change. See docs/bill-payment-states.md.
 */
export function useBillCoverage(billId: BillId): BillCoverage {
  const summaries = useBillLineSummaries(billId)
  const claimedQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
  const { data: claimedPayments } = useEvoluQuery(claimedQuery)

  return useMemo(() => {
    const billTotal = NonNegativeInteger(
      summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
    )
    return deriveBillCoverage(billTotal, calculateClaimedSum(claimedPayments))
  }, [summaries, claimedPayments])
}
