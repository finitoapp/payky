import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
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
