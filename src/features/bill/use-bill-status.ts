import { useMemo } from "react"
import { claimedTransactionsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  type BillStatus,
  calculateClaimedSum,
  deriveBillCoverage,
  deriveBillStatus,
} from "@/core/modules/bill/bill-utils.ts"
import { deriveBillSummaryTotal } from "@/core/modules/bill-line/bill-line-utils.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useOptionalEvoluQuery } from "@/hooks/use-evolu-query.ts"

export interface BillStatusInfo {
  readonly status: BillStatus
  /**
   * The canceled+funded collision from docs/bill-payment-states.md: the
   * bill was discarded, but its payments already cover its total —
   * `deriveBillStatus` still reads `canceled` until staff explicitly
   * resolves it via `confirmBillClosedDespiteCancellation`.
   */
  readonly hasCancellationCollision: boolean
}

/**
 * Reactive equivalent of `loadBillStatus`: the bill's *derived* display
 * status, recomputed live from `canceledAt`/`confirmedClosedAt` and
 * coverage every time the underlying line/payment/claim rows change. Never
 * reads the best-effort `closedAt` cache — see `bill.ts`'s doc comment and
 * docs/bill-payment-states.md. `undefined` until the bill row has loaded,
 * and for an `undefined` `billId` — a cart whose bill hasn't been lazily
 * created yet.
 */
export function useBillStatus(
  billId: BillId | undefined
): BillStatusInfo | undefined {
  const billQuery = useMemo(
    () => (billId === undefined ? null : billByIdQuery(billId)),
    [billId]
  )
  const claimedQuery = useMemo(
    () =>
      billId === undefined ? null : claimedTransactionsByBillIdQuery(billId),
    [billId]
  )
  const { data: billRows } = useOptionalEvoluQuery(billQuery)
  const { data: claimedTransactions } = useOptionalEvoluQuery(claimedQuery)
  const summaries = useBillLineSummaries(billId)
  const bill = billRows[0]

  return useMemo(() => {
    if (bill === undefined) return undefined

    const billTotal = deriveBillSummaryTotal(summaries)
    const claimedSum = calculateClaimedSum(claimedTransactions)
    const coverage = deriveBillCoverage(billTotal, claimedSum)
    const hasActiveClaim = claimedTransactions.length > 0

    const status = deriveBillStatus({
      canceledAt: bill.canceledAt,
      confirmedClosedAt: bill.confirmedClosedAt,
      hasActiveClaim,
      coverage,
    })

    return {
      status,
      hasCancellationCollision:
        bill.canceledAt !== null &&
        bill.confirmedClosedAt === null &&
        hasActiveClaim &&
        coverage !== "underpaid",
    }
  }, [bill, summaries, claimedTransactions])
}
