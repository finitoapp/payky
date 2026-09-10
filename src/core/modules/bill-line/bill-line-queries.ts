import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"

/**
 * `ownerId`/`id` are not cosmetic tie-breaks. Rows written in one mutation
 * batch all share a `createdAt`, and `calculateBillLineSummaries` is an
 * order-dependent fold: it *deletes* a summary once its running quantity
 * reaches zero, so an `add` and a `remove` for the same key within one batch
 * (cart undo writes exactly that) net to either nothing or a live line
 * depending on which the reader sees first.
 *
 * SQLite happens to return those ties in `(ownerId, id)` order already,
 * because Evolu's tables are `WITHOUT ROWID` with a `(ownerId, id)` primary
 * key, which every secondary index carries as its implicit row locator — so
 * `billLine_billId_createdAt` is physically `(billId, createdAt, ownerId,
 * id)`. That is an implementation detail SQLite promises nothing about,
 * though, and this fold decides what a bill totals. Stating the order
 * explicitly in exactly that shape costs nothing: any other tie-break (`id`
 * alone included) forces a `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`,
 * while this one is served straight from the index.
 */
export const billLinesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billLine")
      .selectAll()
      .where("billId", "=", billId)
      .where("billId", "is not", null)
      .where("itemId", "is not", null)
      .where("type", "is not", null)
      .where("kind", "is not", null)
      .where("quantity", "is not", null)
      .where("totalAmount", "is not", null)
      .$narrowType<{
        billId: KyselyNotNull
        itemId: KyselyNotNull
        type: KyselyNotNull
        kind: KyselyNotNull
        quantity: KyselyNotNull
        totalAmount: KyselyNotNull
      }>()
      .orderBy("createdAt", "asc")
      .orderBy("ownerId", "asc")
      .orderBy("id", "asc")
  )
