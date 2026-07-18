import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const activeSparkAccountsQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountSpark", "accountSpark.id", "account.id")
    .select(["account.id", "accountSpark.secret"])
    .where("account.kind", "=", "spark")
    .where("account.isDeleted", "is not", 1)
    .where("accountSpark.isDeleted", "is not", 1)
    .where("account.id", "is not", null)
    .where("accountSpark.secret", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      secret: KyselyNotNull
    }>()
)
