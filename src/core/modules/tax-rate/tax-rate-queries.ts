import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const taxRatesQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .selectAll()
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      rate: KyselyNotNull
      sortOrder: KyselyNotNull
      isDefault: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

export const activeTaxRatesQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .selectAll()
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "is not", null)
    .where("isDeleted", "is", null)
    .where("deactivatedAt", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      rate: KyselyNotNull
      sortOrder: KyselyNotNull
      isDefault: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)
