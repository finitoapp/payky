import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"

export const defaultPaymentAccountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db.selectFrom("defaultPaymentAccount").selectAll().where("id", "=", idValue)
  )

export const activeDefaultPaymentAccountsQuery = createQuery((db) =>
  db
    .selectFrom("defaultPaymentAccount")
    .innerJoin("account", "account.id", "defaultPaymentAccount.id")
    .select(["account.id", "account.kind", "account.name"])
    .where("defaultPaymentAccount.isDeleted", "is not", sqliteTrue)
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.id", "is not", null)
    .where("account.kind", "is not", null)
    .where("account.name", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      kind: KyselyNotNull
      name: KyselyNotNull
    }>()
)

export const activeDefaultPaymentAccountDetailsQuery = createQuery((db) =>
  db
    .selectFrom("defaultPaymentAccount")
    .innerJoin("account", "account.id", "defaultPaymentAccount.id")
    .leftJoin("accountCashRegister", (join) =>
      join
        .onRef("accountCashRegister.id", "=", "account.id")
        .on("accountCashRegister.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountSpark", (join) =>
      join
        .onRef("accountSpark.id", "=", "account.id")
        .on("accountSpark.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountIban", (join) =>
      join
        .onRef("accountIban.id", "=", "account.id")
        .on("accountIban.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "account.id",
      "account.kind",
      "accountCashRegister.currency as cashRegisterCurrency",
      "accountSpark.mnemonic as sparkMnemonic",
      "accountIban.iban as iban",
      "accountIban.currency as ibanCurrency",
    ])
    .where("defaultPaymentAccount.isDeleted", "is not", sqliteTrue)
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.id", "is not", null)
    .where("account.kind", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      kind: KyselyNotNull
    }>()
)
