import { claimedTransactionsByBillIdQuery } from "@payky/core/modules/bill/bill-coverage-queries"
import type { BillCoverageSummary } from "@payky/core/modules/bill/bill-guards"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import {
  calculateClaimedSum,
  deriveBillCoverage,
} from "@payky/core/modules/bill/bill-utils"
import { deriveBillSummaryTotal } from "@payky/core/modules/bill-line/bill-line-utils"
import { useMemo } from "react"
import { useBillLineSummaries } from "@/features/shared/use-bill-line-summaries.ts"
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
