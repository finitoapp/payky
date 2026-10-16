import type { BillId } from "@payky/core/modules/bill/bill-types"
import { billLinesByBillIdQuery } from "@payky/core/modules/bill-line/bill-line-queries"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import { calculateBillLineSummaries } from "@payky/core/modules/bill-line/bill-line-utils"
import { itemsByBillIdQuery } from "@payky/core/modules/item/item-queries"
import { useMemo } from "react"
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
