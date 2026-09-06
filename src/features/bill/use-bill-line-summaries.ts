import { useMemo } from "react"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { billLinesByBillIdQuery } from "@/core/modules/bill-line/bill-line-queries.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  useEvoluQuery,
  useOptionalEvoluQuery,
} from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of `loadCalculatedBillLineSummaries`: subscribes to
 * the bill's line ledger and the item snapshot table, then reduces them
 * through the same pure `calculateBillLineSummaries` on every change. An
 * `undefined` `billId` — a cart whose bill hasn't been lazily created yet —
 * has nothing to subscribe to and yields no summaries.
 */
export function useBillLineSummaries(
  billId: BillId | undefined
): ReadonlyArray<BillLineSummary> {
  const lineQuery = useMemo(
    () => (billId === undefined ? null : billLinesByBillIdQuery(billId)),
    [billId]
  )
  const { data: lineRows } = useOptionalEvoluQuery(lineQuery)
  const { data: itemRows } = useEvoluQuery(itemsQuery)

  return useMemo(
    () => calculateBillLineSummaries(lineRows, itemRows),
    [lineRows, itemRows]
  )
}

/**
 * A bill's total item count and amount, derived from `useBillLineSummaries` —
 * shared by every occupancy-style tile/row that shows just those two numbers
 * for a bill (the floor view's `OccupiedTableSummary`, the split dialog's
 * existing-bill picker) instead of each re-deriving its own reduce.
 */
export function useBillSummaryStats(billId: BillId): {
  readonly itemCount: number
  readonly totalAmount: NonNegativeInteger
} {
  const summaries = useBillLineSummaries(billId)

  return useMemo(
    () => ({
      itemCount: summaries.reduce((sum, summary) => sum + summary.quantity, 0),
      totalAmount: NonNegativeInteger(
        summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
      ),
    }),
    [summaries]
  )
}
