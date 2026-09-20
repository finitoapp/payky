import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"

export const activeCashuAccountsQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountCashu", "accountCashu.id", "account.id")
    .select(["account.id", "accountCashu.mintUrl"])
    .where("account.kind", "=", "cashu")
    .where("account.isDeleted", "is not", 1)
    .where("accountCashu.isDeleted", "is not", 1)
    .where("account.id", "is not", null)
    .where("accountCashu.mintUrl", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      mintUrl: KyselyNotNull
    }>()
)

export const activeCashuAccountByIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .innerJoin("accountCashu", "accountCashu.id", "account.id")
      .select(["account.id", "accountCashu.mintUrl"])
      .where("account.id", "=", accountId)
      .where("account.kind", "=", "cashu")
      .where("account.isDeleted", "is not", 1)
      .where("accountCashu.isDeleted", "is not", 1)
      .where("accountCashu.mintUrl", "is not", null)
      .$narrowType<{
        id: KyselyNotNull
        mintUrl: KyselyNotNull
      }>()
  )
