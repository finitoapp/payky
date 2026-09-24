import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

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

export const cardSwitchioAccountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .innerJoin("accountCardSwitchio", "accountCardSwitchio.id", "account.id")
      .select([
        "account.id",
        "account.name",
        "account.kind",
        "accountCardSwitchio.currency",
      ])
      .where("account.id", "=", idValue)
      .where("account.kind", "=", "cardSwitchio")
      .where("account.isDeleted", "is not", 1)
      .where("accountCardSwitchio.isDeleted", "is not", 1)
      .where("accountCardSwitchio.currency", "is not", null)
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

/**
 * The account of this kind the app configures from settings — the enabled
 * one, else the most recently saved disabled one, so a disabled account still
 * shows the configuration it would come back with. Saving it retires any
 * other account of the kind, so more than one enabled row only appears after
 * two devices saved different values offline; the latest save wins, the same
 * on every device.
 *
 * "Latest save" is `createdAt`, which Evolu restamps on every upsert, and not
 * `updatedAt`: retiring the replaced account is an update in the very batch
 * that saves its successor, so the two share a timestamp, and only
 * `createdAt` keeps the retired one from tying with it.
 */
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
    .where("account.kind", "=", "iban")
    .where("accountIban.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountIban.iban", "is not", null)
    .where("accountIban.currency", "is not", null)
    .orderBy("account.isDeleted")
    .orderBy("account.createdAt", "desc")
    .orderBy("account.id")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      iban: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

/** Picked the same way as `fiatBankAccountQuery`. */
export const sparkAccountQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountSpark", "accountSpark.id", "account.id")
    .select([
      "account.id",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountSpark.secret",
    ])
    .where("account.kind", "=", "spark")
    .where("accountSpark.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountSpark.secret", "is not", null)
    .orderBy("account.isDeleted")
    .orderBy("account.createdAt", "desc")
    .orderBy("account.id")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      secret: KyselyNotNull
    }>()
)

/** Picked the same way as `fiatBankAccountQuery`. */
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
    .where("account.kind", "=", "cashRegister")
    .where("accountCashRegister.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountCashRegister.currency", "is not", null)
    .orderBy("account.isDeleted")
    .orderBy("account.createdAt", "desc")
    .orderBy("account.id")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

export const cardSwitchioAccountQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountCardSwitchio", "accountCardSwitchio.id", "account.id")
    .select([
      "account.id",
      "account.name",
      "account.kind",
      "account.isDeleted",
      "accountCardSwitchio.currency",
    ])
    .where("account.kind", "=", "cardSwitchio")
    .where("accountCardSwitchio.isDeleted", "is not", 1)
    .where("account.name", "is not", null)
    .where("account.kind", "is not", null)
    .where("accountCardSwitchio.currency", "is not", null)
    .orderBy("account.isDeleted")
    .orderBy("account.createdAt", "desc")
    .orderBy("account.id")
    .limit(1)
    .$narrowType<{
      name: KyselyNotNull
      kind: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

/**
 * Every non-deleted account with the method-specific columns the payment
 * waiting screen needs to offer a Spark, IBAN, cash-register, or card tab.
 *
 * Newest first, so the screen's first match per kind is the same account
 * `fiatBankAccountQuery` and its siblings pick.
 */
export const enabledPaymentMethodAccountsQuery = createQuery((db) =>
  db
    .selectFrom("account")
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
    .leftJoin("accountCashRegister", (join) =>
      join
        .onRef("accountCashRegister.id", "=", "account.id")
        .on("accountCashRegister.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountCardSwitchio", (join) =>
      join
        .onRef("accountCardSwitchio.id", "=", "account.id")
        .on("accountCardSwitchio.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "account.id",
      "account.kind",
      "accountSpark.secret as sparkSecret",
      "account.name",
      "accountIban.iban",
      "accountIban.currency as ibanCurrency",
      "accountIban.defaultQrFormat as ibanDefaultQrFormat",
      "accountCashRegister.currency as cashRegisterCurrency",
      "accountCardSwitchio.currency as cardCurrency",
    ])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.id", "is not", null)
    .where("account.kind", "is not", null)
    .orderBy("account.createdAt", "desc")
    .orderBy("account.id")
    .$narrowType<{
      id: KyselyNotNull
      kind: KyselyNotNull
    }>()
)
