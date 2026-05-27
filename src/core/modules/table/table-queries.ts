import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const tablesQuery = createQuery((db) =>
  db
    .selectFrom("table")
    .selectAll()
    .where("name", "is not", null)
    .where("sortOrder", "is not", null)
    .$narrowType<{
      name: KyselyNotNull
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)
