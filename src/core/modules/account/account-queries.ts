import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "./account-types.ts"
import {
  cashRegisterAccountId,
  fiatBankAccountId,
  sparkAccountId,
} from "./account-utils.ts"

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

export const ibanAccountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .innerJoin("accountIban", "accountIban.id", "account.id")
      .select([
        "account.id",
        "account.name",
        "account.kind",
        "accountIban.iban",
        "accountIban.currency",
        "accountIban.defaultQrFormat",
      ])
      .where("account.id", "=", idValue)
      .where("account.kind", "=", "iban")
      .where("account.isDeleted", "is not", 1)
      .where("accountIban.isDeleted", "is not", 1)
      .where("accountIban.iban", "is not", null)
      .where("accountIban.currency", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        kind: KyselyNotNull
        iban: KyselyNotNull
        currency: KyselyNotNull
      }>()
  )

export const fiatBankAccountQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountIban", "accountIban.id", "account.id")
    .select([
      "account.id",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountIban.iban",
      "accountIban.currency",
      "accountIban.defaultQrFormat",
    ])
    .where("account.id", "=", fiatBankAccountId)
    .where("account.kind", "=", "iban")
    .where("accountIban.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountIban.iban", "is not", null)
    .where("accountIban.currency", "is not", null)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      iban: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

export const sparkAccountQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountSpark", "accountSpark.id", "account.id")
    .select([
      "account.id",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountSpark.mnemonic",
    ])
    .where("account.id", "=", sparkAccountId)
    .where("account.kind", "=", "spark")
    .where("accountSpark.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountSpark.mnemonic", "is not", null)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      mnemonic: KyselyNotNull
    }>()
)

export const cashRegisterAccountQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountCashRegister", "accountCashRegister.id", "account.id")
    .select([
      "account.id",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountCashRegister.currency",
    ])
    .where("account.id", "=", cashRegisterAccountId)
    .where("account.kind", "=", "cashRegister")
    .where("accountCashRegister.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountCashRegister.currency", "is not", null)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      currency: KyselyNotNull
    }>()
)
