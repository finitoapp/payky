import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/evolu/schema.ts"
import type { BillId } from "./bill-types.ts"

export const billByIdQuery = (idValue: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("bill")
      .selectAll()
      .where("id", "=", idValue)
      .where("displayNumber", "is not", null)
      .where("status", "is not", null)
      .where("currency", "is not", null)
      .$narrowType<{
        displayNumber: KyselyNotNull
        status: KyselyNotNull
        currency: KyselyNotNull
      }>()
  )

export const billLinesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billItemLine")
      .selectAll()
      .where("billId", "=", billId)
      .where("billId", "is not", null)
      .where("itemId", "is not", null)
      .where("type", "is not", null)
      .where("_tag", "is not", null)
      .where("quantity", "is not", null)
      .where("totalAmount", "is not", null)
      .$narrowType<{
        billId: KyselyNotNull
        itemId: KyselyNotNull
        type: KyselyNotNull
        _tag: KyselyNotNull
        quantity: KyselyNotNull
        totalAmount: KyselyNotNull
      }>()
      .orderBy("createdAt", "asc")
  )

export const openBillsQuery = createQuery((db) =>
  db
    .selectFrom("bill")
    .selectAll()
    .where("status", "in", ["open", "partiallyPaid"])
    .where("displayNumber", "is not", null)
    .where("status", "is not", null)
    .where("currency", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
      status: KyselyNotNull
      currency: KyselyNotNull
    }>()
)
