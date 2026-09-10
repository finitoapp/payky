import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"

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

/**
 * The one active Spark account behind an id, with its wallet secret.
 *
 * Callers that need a single account use this rather than filtering
 * `activeSparkAccountsQuery` in JS: that loads every Spark account's secret to
 * discard all but one, and `account` is keyed `(ownerId, id)`, so asking by id
 * is a primary-key lookup.
 */
export const activeSparkAccountByIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .innerJoin("accountSpark", "accountSpark.id", "account.id")
      .select(["account.id", "accountSpark.secret"])
      .where("account.id", "=", accountId)
      .where("account.kind", "=", "spark")
      .where("account.isDeleted", "is not", 1)
      .where("accountSpark.isDeleted", "is not", 1)
      .where("accountSpark.secret", "is not", null)
      .$narrowType<{
        id: KyselyNotNull
        secret: KyselyNotNull
      }>()
  )
