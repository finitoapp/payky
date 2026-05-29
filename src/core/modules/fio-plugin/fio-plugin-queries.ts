import { evoluJsonArrayFrom, type KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"

export const fioPluginByIdQuery = (idValue: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .selectAll()
      .where("id", "=", idValue)
      .where("accountId", "is not", null)
      .where("apiUrl", "is not", null)
      .where("numberOfSecondsBetweenChecks", "is not", null)
      .where("isActive", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        accountId: KyselyNotNull
        apiUrl: KyselyNotNull
        numberOfSecondsBetweenChecks: KyselyNotNull
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

export const activeFioPluginsQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .innerJoin("account", "account.id", "fioPlugin.accountId")
    .innerJoin("accountIban", "accountIban.id", "account.id")
    .select((eb) => [
      "fioPlugin.id",
      "fioPlugin.accountId",
      "fioPlugin.apiUrl",
      "fioPlugin.numberOfSecondsBetweenChecks",
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
    .where("fioPlugin.apiUrl", "is not", null)
    .where("fioPlugin.numberOfSecondsBetweenChecks", "is not", null)
    .where("accountIban.iban", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      accountId: KyselyNotNull
      apiUrl: KyselyNotNull
      numberOfSecondsBetweenChecks: KyselyNotNull
      iban: KyselyNotNull
    }>()
)
