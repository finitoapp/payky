import { evoluJsonArrayFrom, type KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { legacyFiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
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
      .where("isDeleted", "is not", 1)
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
      .where("isDeleted", "is not", 1)
      .$narrowType<{
        fioPluginId: KyselyNotNull
        token: KyselyNotNull
      }>()
      .orderBy("createdAt")
      .orderBy("ownerId")
      .orderBy("id")
  )

export const fiatBankAccountFioPluginQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .selectAll()
    .where("id", "=", fioPluginId)
    .where("accountId", "is not", null)
    .where("numberOfSecondsBetweenChecks", "is not", null)
    .where("isActive", "is not", null)
    .where("isDeleted", "is not", 1)
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
      .where("isDeleted", "is not", 1)
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
          .where("fioPluginToken.isDeleted", "is not", 1)
          // `(ownerId, id)` after `createdAt` for the same reason
          // `billLinesByBillIdQuery` needs it: tokens written in one batch
          // share a `createdAt`, and the sync job compares token *order* to
          // decide whether its session still matches (`areTokensEqual`). An
          // unstable order would restart the session — and so fire an extra
          // FIO request, against a rate-limited API — for no reason.
          .orderBy("fioPluginToken.createdAt")
          .orderBy("fioPluginToken.ownerId")
          .orderBy("fioPluginToken.id")
          .$narrowType<{
            token: KyselyNotNull
          }>()
      ).as("tokens"),
    ])
    .where("fioPlugin.isActive", "=", 1)
    .where("fioPlugin.isDeleted", "is not", 1)
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
      .select([
        "accountTransactionIban.bankReference",
        "accountTransactionIban.id as accountTransactionId",
      ])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransactionIban.bankReference", "in", bankReferences)
      .where("accountTransactionIban.bankReference", "is not", null)
      .$narrowType<{
        bankReference: KyselyNotNull
      }>()
  )

/**
 * Whether `legacyFioPluginsQuery` would return anything, without building the
 * token arrays for rows nobody is going to read — this runs at every app
 * start as the migration's `hasWork` check, while the full query runs only on
 * the installs that actually have a legacy row.
 *
 * Its predicates must stay identical to `legacyFioPluginsQuery`'s. A row that
 * passed here but not there would leave the migration with work it can never
 * finish, so the popup would come back at every start.
 */
export const hasLegacyFioPluginQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .select("id")
    .where("accountId", "=", legacyFiatBankAccountId)
    .where("id", "!=", fioPluginId)
    .where("id", "is not", null)
    .where("numberOfSecondsBetweenChecks", "is not", null)
    .where("isActive", "is not", null)
    .where("isDeleted", "is not", 1)
    .limit(1)
)

/**
 * Plugins still sitting at a generated id, from before the plugin became a
 * singleton at the fixed `fioPluginId`. Their tokens and sync pointer are
 * keyed to that old id, so the settings page — which reads the fixed one —
 * finds none of them.
 *
 * Newest first, because `migrateLegacyFioPlugins` takes the settings from the
 * most recent row while adopting every row's tokens.
 */
export const legacyFioPluginsQuery = createQuery((db) =>
  db
    .selectFrom("fioPlugin")
    .select((eb) => [
      "fioPlugin.id",
      "fioPlugin.numberOfSecondsBetweenChecks",
      "fioPlugin.syncLookbackDays",
      "fioPlugin.isActive",
      evoluJsonArrayFrom(
        eb
          .selectFrom("fioPluginToken")
          .select(["fioPluginToken.id", "fioPluginToken.token"])
          .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
          .where("fioPluginToken.token", "is not", null)
          .where("fioPluginToken.isDeleted", "is not", 1)
          .$narrowType<{
            token: KyselyNotNull
          }>()
      ).as("tokens"),
    ])
    .where("fioPlugin.accountId", "=", legacyFiatBankAccountId)
    .where("fioPlugin.id", "!=", fioPluginId)
    .where("fioPlugin.id", "is not", null)
    .where("fioPlugin.numberOfSecondsBetweenChecks", "is not", null)
    .where("fioPlugin.isActive", "is not", null)
    .where("fioPlugin.isDeleted", "is not", 1)
    .orderBy("fioPlugin.createdAt", "desc")
    .$narrowType<{
      id: KyselyNotNull
      numberOfSecondsBetweenChecks: KyselyNotNull
      isActive: KyselyNotNull
    }>()
)
