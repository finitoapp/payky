import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/evolu/schema.ts"

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
