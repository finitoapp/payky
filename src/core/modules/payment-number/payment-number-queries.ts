import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const paymentNumbersByNewestQuery = createQuery((db) =>
  db
    .selectFrom("paymentNumber")
    .selectAll()
    .where("serialNumber", "is not", null)
    .where("date", "is not", null)
    .orderBy("date", "desc")
    .orderBy("serialNumber", "desc")
    .$narrowType<{
      serialNumber: KyselyNotNull
      date: KyselyNotNull
    }>()
)
