import { useMemo } from "react"

import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  type BillStatus,
  calculateClaimedSum,
  deriveBillCoverage,
  deriveBillStatus,
} from "@/core/modules/bill/bill-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

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
 * docs/bill-payment-states.md. `undefined` until the bill row has loaded.
 */
export function useBillStatus(billId: BillId): BillStatusInfo | undefined {
  const billQuery = useMemo(() => billByIdQuery(billId), [billId])
  const claimedQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
  const { data: billRows } = useEvoluQuery(billQuery)
  const { data: claimedPayments } = useEvoluQuery(claimedQuery)
  const summaries = useBillLineSummaries(billId)
  const bill = billRows[0]

  return useMemo(() => {
    if (bill === undefined) return undefined

    const billTotal = NonNegativeInteger(
      summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
    )
    const claimedSum = calculateClaimedSum(claimedPayments)
    const coverage = deriveBillCoverage(billTotal, claimedSum)
    const hasActiveClaim = claimedPayments.length > 0

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
  }, [bill, summaries, claimedPayments])
}
