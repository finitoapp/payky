import { useMemo } from "react"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { billLinesByBillIdQuery } from "@/core/modules/bill-line/bill-line-queries.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of `loadCalculatedBillLineSummaries`: subscribes to
 * the bill's line ledger and the item snapshot table, then reduces them
 * through the same pure `calculateBillLineSummaries` on every change. Only
 * call this once `billId` is known — an empty cart with no bill yet has
 * nothing to subscribe to.
 */
export function useBillLineSummaries(
  billId: BillId
): ReadonlyArray<BillLineSummary> {
  const lineQuery = useMemo(() => billLinesByBillIdQuery(billId), [billId])
  const { data: lineRows } = useEvoluQuery(lineQuery)
  const { data: itemRows } = useEvoluQuery(itemsQuery)

  return useMemo(
    () => calculateBillLineSummaries(lineRows, itemRows),
    [lineRows, itemRows]
  )
}
