import {
  evoluJsonArrayFrom,
  sqliteFalse,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { legacyFiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import { saveFioPlugin } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { fioPluginTokensByPluginIdQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { fioPluginId } from "@/core/modules/fio-plugin/fio-plugin-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import {
  DateStringSchema,
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import {
  fioPluginFixedIdMigration,
  hasLegacyFioPluginQuery,
  legacyFioPluginsQuery,
} from "./fio-plugin-fixed-id-migration.ts"

const fioPluginWithTokensByIdQuery = (id: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .select((eb) => [
        "fioPlugin.id",
        "fioPlugin.accountId",
        "fioPlugin.numberOfSecondsBetweenChecks",
        "fioPlugin.syncLookbackDays",
        "fioPlugin.isActive",
        "fioPlugin.isDeleted",
        evoluJsonArrayFrom(
          eb
            .selectFrom("fioPluginToken")
            .select([
              "fioPluginToken.id",
              "fioPluginToken.fioPluginId",
              "fioPluginToken.token",
              "fioPluginToken.isDeleted",
            ])
            .whereRef("fioPluginToken.fioPluginId", "=", "fioPlugin.id")
            .orderBy("fioPluginToken.createdAt")
        ).as("tokens"),
      ])
      .where("fioPlugin.id", "=", id)
  )

const fioPluginSyncPointerByIdQuery = (id: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPluginSyncPointer")
      .select(["id", "lastSyncedDate", "isDeleted"])
      .where("id", "=", id)
  )

/**
 * The shape the versions before the singleton id left behind: a plugin at a
 * generated id, with its tokens and sync pointer keyed to that same id.
 */
const seedLegacyFioPlugin = async (evolu: EvoluDep["evolu"]) => {
  const id = createRowId<"FioPlugin">()
  const tokenId = createRowId<"FioPluginToken">()

  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, ownerId: evolu.appOwner.id }

    evolu.upsert(
      "fioPlugin",
      {
        id,
        accountId: legacyFiatBankAccountId,
        numberOfSecondsBetweenChecks: PositiveInteger(300),
        syncLookbackDays: PositiveInteger(3),
        isActive: sqliteTrue,
        isDeleted: sqliteFalse,
      },
      mutationOptions
    )
    evolu.upsert(
      "fioPluginToken",
      {
        id: tokenId,
        fioPluginId: id,
        token: NonEmptyString255("fio-token-legacy"),
        isDeleted: sqliteFalse,
      },
      mutationOptions
    )
    evolu.upsert(
      "fioPluginSyncPointer",
      {
        id,
        lastSyncedDate: DateStringSchema.decode("2026-06-10"),
        isDeleted: sqliteFalse,
      },
      mutationOptions
    )
  })

  return { id, tokenId }
}

describe("fioPluginFixedIdMigration", () => {
  test("re-points a plugin left at a generated id onto the fixed one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    const legacy = await seedLegacyFioPlugin(evolu)

    // The migration's `hasWork` check has to agree with the query that does
    // the work, or the migration popup reopens at every app start.
    await expect
      .poll(() => evolu.loadQuery(hasLegacyFioPluginQuery))
      .toMatchObject([{ id: legacy.id }])

    await expect(run(fioPluginFixedIdMigration.hasWork)).resolves.toMatchObject(
      {
        ok: true,
        value: true,
      }
    )
    await run.ok(fioPluginFixedIdMigration.run)

    // Settings, token and sync pointer all land on the fixed id.
    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(fioPluginId)))
      .toMatchObject([
        {
          id: fioPluginId,
          accountId: legacyFiatBankAccountId,
          numberOfSecondsBetweenChecks: 300,
          syncLookbackDays: 3,
          isActive: sqliteTrue,
          isDeleted: sqliteFalse,
          tokens: [{ token: "fio-token-legacy", isDeleted: sqliteFalse }],
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(fioPluginSyncPointerByIdQuery(fioPluginId)))
      .toEqual([
        {
          id: fioPluginId,
          lastSyncedDate: "2026-06-10",
          isDeleted: sqliteFalse,
        },
      ])

    // Which is what the settings page reads — the symptom this fixes.
    await expect
      .poll(() => evolu.loadQuery(fioPluginTokensByPluginIdQuery(fioPluginId)))
      .toMatchObject([{ token: "fio-token-legacy" }])

    // The legacy rows are retired, so nothing syncs off two plugins.
    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(legacy.id)))
      .toMatchObject([
        {
          isDeleted: sqliteTrue,
          tokens: [{ id: legacy.tokenId, isDeleted: sqliteTrue }],
        },
      ])

    // And a second pass finds nothing left to do.
    await expect.poll(() => evolu.loadQuery(legacyFioPluginsQuery)).toEqual([])
    await expect
      .poll(() => evolu.loadQuery(hasLegacyFioPluginQuery))
      .toEqual([])
    await expect(run(fioPluginFixedIdMigration.hasWork)).resolves.toMatchObject(
      {
        ok: true,
        value: false,
      }
    )
  }, 15_000)

  test("keeps settings already saved at the fixed id, adopts the legacy token", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    await seedLegacyFioPlugin(evolu)

    // What a user hit after updating: the form saved a second plugin at the
    // fixed id, tokenless, while the legacy row kept the tokens.
    await run.ok(
      saveFioPlugin({
        accountId: legacyFiatBankAccountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        isActive: sqliteFalse,
      })
    )
    await run.ok(fioPluginFixedIdMigration.run)

    // That save is the newer intent, so it survives — only the token moves.
    await expect
      .poll(() => evolu.loadQuery(fioPluginWithTokensByIdQuery(fioPluginId)))
      .toMatchObject([
        {
          numberOfSecondsBetweenChecks: 60,
          isActive: sqliteFalse,
          tokens: [{ token: "fio-token-legacy", isDeleted: sqliteFalse }],
        },
      ])
  }, 15_000)
})
