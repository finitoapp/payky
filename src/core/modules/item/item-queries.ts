import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"

export const itemsQuery = createQuery((db) =>
  db
    .selectFrom("item")
    .selectAll()
    .where("name", "is not", null)
    .where("currency", "is not", null)
    .where("unitAmount", "is not", null)
    .$narrowType<{
      name: KyselyNotNull
      currency: KyselyNotNull
      unitAmount: KyselyNotNull
    }>()
)

/**
 * Only the item snapshots referenced by one bill's lines — the scoped
 * counterpart to `itemsQuery`, for `loadCalculatedBillLineSummaries`.
 *
 * `itemsQuery` is a whole-table read, and `item` rows are content-addressed
 * snapshots that are never deleted, so it grows with every distinct
 * name/price a POS has ever sold. Loading it per bill made every guard, every
 * added line, and every entry of a bill list scan that whole history. Same
 * `ItemRow` shape, so `calculateBillLineSummaries` takes either.
 *
 * `distinct` because one snapshot is normally shared by several lines (and by
 * several bills): the join would otherwise return it once per line.
 */
export const itemsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("item")
      .innerJoin("billLine", "billLine.itemId", "item.id")
      .selectAll("item")
      .distinct()
      .where("billLine.billId", "=", billId)
      .where("item.name", "is not", null)
      .where("item.currency", "is not", null)
      .where("item.unitAmount", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
      }>()
  )
