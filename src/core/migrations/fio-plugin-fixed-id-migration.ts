import {
  evoluJsonArrayFrom,
  type KyselyNotNull,
  ok,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AppMigration } from "@/core/migrations/migrations.ts"
import { fiatBankAccountQuery } from "@/core/modules/account/account-queries.ts"
import { legacyFiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import {
  createFioPluginTokenId,
  defaultFioPluginSyncLookbackDays,
} from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import {
  fioPluginByIdQuery,
  fioPluginSyncPointerByPluginIdQuery,
} from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"

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
 * Newest first, because the migration takes the settings from the most recent
 * row while adopting every row's tokens.
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

/**
 * Re-points a Fio plugin left at a generated id onto the fixed `fioPluginId`.
 *
 * Before the plugin became a singleton, `createFioPlugin` minted a random id
 * per row. Installs that configured the integration back then still hold that
 * row, and their tokens and sync pointer are keyed to it — so the settings
 * page, which reads the fixed id, showed no tokens at all and a save wrote a
 * second plugin the sync job then ignored for having none. Evolu row ids are
 * the CRDT's primary key, so the rows are copied across and the originals
 * tombstoned rather than renamed.
 *
 * What wins where the two overlap:
 *
 * - Settings already at the fixed id stay. Reaching this with both rows
 *   present means the user saved the form after updating, and that save is
 *   newer than anything the legacy row still holds.
 * - Tokens are adopted from *every* legacy row, since dropping one silently
 *   revokes a working token. Their ids derive from the value, so a token the
 *   fixed id already has collapses into the same row.
 * - The sync pointer is adopted only if the fixed id has none, so an already
 *   synced position is never rewound.
 *
 * Idempotent: `legacyFioPluginsQuery` is empty once this has run, which is
 * what `hasWork` reads.
 */
export const fioPluginFixedIdMigration: AppMigration = {
  name: "2026-09-14-fio-plugin-fixed-id",
  hasWork: async (run) =>
    ok((await run.deps.evolu.loadQuery(hasLegacyFioPluginQuery)).length > 0),
  run: async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const legacyPlugins = await evolu.loadQuery(legacyFioPluginsQuery)
    const [newestLegacy] = legacyPlugins
    if (newestLegacy === undefined) return ok(undefined)

    const [current] = await evolu.loadQuery(fioPluginByIdQuery(fioPluginId))
    const [bankAccount] = await evolu.loadQuery(fiatBankAccountQuery)
    const [currentPointer] = await evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(fioPluginId)
    )
    const [legacyPointer] = await evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(newestLegacy.id)
    )

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }

      if (current === undefined) {
        evolu.upsert(
          "fioPlugin",
          removeUndefinedValues({
            id: fioPluginId,
            accountId: bankAccount?.id ?? legacyFiatBankAccountId,
            numberOfSecondsBetweenChecks:
              newestLegacy.numberOfSecondsBetweenChecks,
            syncLookbackDays:
              newestLegacy.syncLookbackDays ?? defaultFioPluginSyncLookbackDays,
            isActive: newestLegacy.isActive,
            isDeleted: sqliteFalse,
          }),
          mutationOptions
        )
      }

      if (currentPointer === undefined && legacyPointer !== undefined) {
        evolu.upsert(
          "fioPluginSyncPointer",
          {
            id: fioPluginId,
            lastSyncedDate: legacyPointer.lastSyncedDate,
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      }

      for (const plugin of legacyPlugins) {
        for (const legacyToken of plugin.tokens) {
          evolu.upsert(
            "fioPluginToken",
            {
              id: createFioPluginTokenId({
                fioPluginId,
                token: legacyToken.token,
              }),
              fioPluginId,
              token: legacyToken.token,
              isDeleted: sqliteFalse,
            },
            mutationOptions
          )
          evolu.update(
            "fioPluginToken",
            { id: legacyToken.id, isDeleted: sqliteTrue },
            mutationOptions
          )
        }

        // The legacy sync pointer is left where it is: it is addressed by the
        // plugin id that is going away, so nothing can read it again.
        evolu.update(
          "fioPlugin",
          { id: plugin.id, isDeleted: sqliteTrue },
          mutationOptions
        )
      }
    })

    return ok(undefined)
  },
}
