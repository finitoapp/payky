import { useMemo } from "react"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { billLinesByBillIdQuery } from "@/core/modules/bill-line/bill-line-queries.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
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
