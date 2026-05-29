import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "./account-types.ts"

export const accountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("kind", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        kind: KyselyNotNull
      }>()
  )

export const cashRegisterAccountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .innerJoin("accountCashRegister", "accountCashRegister.id", "account.id")
      .select([
        "account.id",
        "account.name",
        "account.kind",
        "accountCashRegister.currency",
      ])
      .where("account.id", "=", idValue)
      .where("account.kind", "=", "cashRegister")
      .where("account.isDeleted", "is not", 1)
      .where("accountCashRegister.isDeleted", "is not", 1)
      .where("accountCashRegister.currency", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        kind: KyselyNotNull
        currency: KyselyNotNull
      }>()
  )
