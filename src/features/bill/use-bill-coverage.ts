import { useMemo } from "react"
import { claimedTransactionsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import type { BillCoverageSummary } from "@/core/modules/bill/bill-guards.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  calculateClaimedSum,
  deriveBillCoverage,
} from "@/core/modules/bill/bill-utils.ts"
import { deriveBillSummaryTotal } from "@/core/modules/bill-line/bill-line-utils.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of `loadBillCoverage`: subscribes to the bill's line
 * ledger and its claimed payments, then re-derives billTotal/claimedSum/
 * paid-underpaid-overpaid on every change. See docs/bill-payment-states.md.
 */
export function useBillCoverage(billId: BillId): BillCoverageSummary {
  const summaries = useBillLineSummaries(billId)
  const claimedQuery = claimedTransactionsByBillIdQuery(billId)
  const { data: claimedTransactions } = useEvoluQuery(claimedQuery)

  return useMemo(() => {
    const billTotal = deriveBillSummaryTotal(summaries)
    const claimedSum = calculateClaimedSum(claimedTransactions)
    return {
      billTotal,
      claimedSum,
      coverage: deriveBillCoverage(billTotal, claimedSum),
    }
  }, [summaries, claimedTransactions])
}
