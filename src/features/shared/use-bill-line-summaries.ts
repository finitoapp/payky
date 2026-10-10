import { useMemo } from "react"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { billLinesByBillIdQuery } from "@/core/modules/bill-line/bill-line-queries.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import { itemsByBillIdQuery } from "@/core/modules/item/item-queries.ts"
import { useOptionalEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Reactive equivalent of `loadCalculatedBillLineSummaries`: subscribes to
 * the bill's line ledger and to the item snapshots those lines reference,
 * then reduces them through the same pure `calculateBillLineSummaries` on
 * every change. An `undefined` `billId` — a cart whose bill hasn't been
 * lazily created yet — has nothing to subscribe to and yields no summaries.
 */
export function useBillLineSummaries(
  billId: BillId | undefined
): ReadonlyArray<BillLineSummary> {
  const lineQuery = useMemo(
    () => (billId === undefined ? null : billLinesByBillIdQuery(billId)),
    [billId]
  )
  const { data: lineRows } = useOptionalEvoluQuery(lineQuery)
  const itemQuery = useMemo(
    () => (billId === undefined ? null : itemsByBillIdQuery(billId)),
    [billId]
  )
  const { data: itemRows } = useOptionalEvoluQuery(itemQuery)

  return useMemo(
    () => calculateBillLineSummaries(lineRows, itemRows),
    [lineRows, itemRows]
  )
}
