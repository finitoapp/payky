import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { TableId } from "./table-types.ts"

export const tablesQuery = createQuery((db) =>
  db
    .selectFrom("table")
    .selectAll()
    .where("name", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

export const tableByIdQuery = (idValue: TableId) =>
  createQuery((db) =>
    db
      .selectFrom("table")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("sortOrder", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()
  )
