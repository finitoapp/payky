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
    .where("status", "=", "open")
    .where("displayNumber", "is not", null)
    .where("status", "is not", null)
    .where("currency", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
      status: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

/**
 * Every bill's `displayNumber`, oldest first, regardless of status — the
 * source `createBillAtEnd` derives the next sequential number from. Must
 * include closed/canceled bills too so numbers are never reused.
 */
export const allBillDisplayNumbersQuery = createQuery((db) =>
  db
    .selectFrom("bill")
    .select(["displayNumber"])
    .where("displayNumber", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
    }>()
    .orderBy("displayNumber", "asc")
)
