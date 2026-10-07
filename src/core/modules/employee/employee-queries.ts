import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const activeEmployeesQuery = createQuery((db) =>
  db
    .selectFrom("employee")
    .select(["id", "name"])
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .orderBy("name")
    .orderBy("id")
    .$narrowType<{ name: KyselyNotNull }>()
)
