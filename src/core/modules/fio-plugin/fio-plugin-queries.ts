import { evoluJsonArrayFrom, type KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { fiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import type { NonEmptyString255 } from "@/core/modules/shared/schema.ts"

export const fioPluginByIdQuery = (idValue: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .selectAll()
      .where("id", "=", idValue)
      .where("accountId", "is not", null)
      .where("numberOfSecondsBetweenChecks", "is not", null)
      .where("syncLookbackDays", "is not", null)
      .where("isActive", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        accountId: KyselyNotNull
        numberOfSecondsBetweenChecks: KyselyNotNull
        syncLookbackDays: KyselyNotNull
        isActive: KyselyNotNull
      }>()
  )

export const fioPluginTokensByPluginIdQuery = (fioPluginId: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPluginToken")
      .selectAll()
      .where("fioPluginId", "=", fioPluginId)
      .where("token", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        fioPluginId: KyselyNotNull
        token: KyselyNotNull
      }>()
  )

export const fiatBankAccountFioPluginQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .selectAll()
    .where("accountId", "=", fiatBankAccountId)
    .where("accountId", "is not", null)
    .where("numberOfSecondsBetweenChecks", "is not", null)
    .where("isActive", "is not", null)
    .where("isDeleted", "is", null)
    .orderBy("createdAt", "desc")
    .limit(1)
    .$narrowType<{
      accountId: KyselyNotNull
      numberOfSecondsBetweenChecks: KyselyNotNull
      isActive: KyselyNotNull
    }>()
)

export const fioPluginSyncPointerByPluginIdQuery = (fioPluginId: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPluginSyncPointer")
      .selectAll()
      .where("id", "=", fioPluginId)
      .where("lastSyncedDate", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        lastSyncedDate: KyselyNotNull
      }>()
  )

export const activeFioPluginsQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .innerJoin("account", "account.id", "fioPlugin.accountId")
    .innerJoin("accountIban", "accountIban.id", "account.id")
    .select((eb) => [
      "fioPlugin.id",
      "fioPlugin.accountId",
      "fioPlugin.numberOfSecondsBetweenChecks",
      "fioPlugin.syncLookbackDays",
      "accountIban.iban",
      evoluJsonArrayFrom(
        eb
          .selectFrom("fioPluginToken")
          .select(["fioPluginToken.token"])
          .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
          .where("fioPluginToken.token", "is not", null)
          .where("fioPluginToken.isDeleted", "is", null)
          .orderBy("fioPluginToken.createdAt")
          .$narrowType<{
            token: KyselyNotNull
          }>()
      ).as("tokens"),
    ])
    .where("fioPlugin.isActive", "=", 1)
    .where("fioPlugin.isDeleted", "is", null)
    .where("account.kind", "=", "iban")
    .where("account.isDeleted", "is not", 1)
    .where("accountIban.isDeleted", "is not", 1)
    .where("fioPlugin.id", "is not", null)
    .where("fioPlugin.accountId", "is not", null)
    .where("fioPlugin.numberOfSecondsBetweenChecks", "is not", null)
    .where("accountIban.iban", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      accountId: KyselyNotNull
      numberOfSecondsBetweenChecks: KyselyNotNull
      iban: KyselyNotNull
    }>()
)

export const existingFioTransactionBankReferencesQuery = ({
  accountId,
  bankReferences,
}: {
  readonly accountId: AccountId
  readonly bankReferences: ReadonlyArray<NonEmptyString255>
}) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransactionIban")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "accountTransactionIban.id"
      )
      .select(["accountTransactionIban.bankReference"])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransactionIban.bankReference", "in", bankReferences)
      .where("accountTransactionIban.bankReference", "is not", null)
      .$narrowType<{
        bankReference: KyselyNotNull
      }>()
  )
