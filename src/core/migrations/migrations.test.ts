import {
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createDeviceQuery } from "@/core/evolu/device-client.ts"
import {
  type AppMigration,
  appMigrations,
  type DeviceMigration,
  deviceMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@/core/migrations/migrations.ts"
import { legacyFiatBankAccountId } from "@/core/modules/account/account-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import {
  NonEmptyString255,
  PositiveInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { createTestDeviceEvolu } from "@/test/device-evolu.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import { createTestLocalStorage } from "@/test/local-storage.ts"

/**
 * A migration whose work is a plain flag rather than rows, so the runner can
 * be exercised without a domain schema behind it. `run` clears the flag, which
 * is what a real migration does by writing the rows its `hasWork` reads.
 */
const createTestMigration = (name: string, hasWorkInitially: boolean) => {
  const ran: string[] = []
  let pending = hasWorkInitially

  const migration: AppMigration = {
    name,
    hasWork: async () => ok(pending),
    run: async () => {
      ran.push(name)
      pending = false
      return ok(undefined)
    },
  }

  return { migration, ran, hasPendingWork: () => pending }
}

const createDeps = async (): Promise<{
  readonly deps: EvoluDep & EvoluOwnerIdDep
  readonly dispose: () => Promise<void>
}> => {
  const testEvolu = await createEvoluTest()
  const { evolu } = testEvolu

  return {
    deps: evoluTestDeps(evolu),
    dispose: () => testEvolu[Symbol.asyncDispose](),
  }
}

describe("app migrations", () => {
  test("reports only the migrations that still have work", async () => {
    const { deps, dispose } = await createDeps()
    try {
      await using run = testCreateRun(deps)
      const done = createTestMigration("done", false)
      const pending = createTestMigration("pending", true)

      await expect(
        run(loadPendingMigrations([done.migration, pending.migration]))
      ).resolves.toMatchObject({
        ok: true,
        value: [{ name: "pending" }],
      })

      // Asking must not run anything — the UI asks on every start, and the
      // popup opens off the answer.
      expect(done.ran).toEqual([])
      expect(pending.ran).toEqual([])
    } finally {
      await dispose()
    }
  })

  test("runs migrations in registry order and leaves no work behind", async () => {
    const { deps, dispose } = await createDeps()
    try {
      await using run = testCreateRun(deps)
      const first = createTestMigration("first", true)
      const second = createTestMigration("second", true)
      const migrations = [first.migration, second.migration]

      const pending = await run.ok(loadPendingMigrations(migrations))
      await expect(run(runMigrations(pending))).resolves.toMatchObject({
        ok: true,
        value: 2,
      })

      expect([...first.ran, ...second.ran]).toEqual(["first", "second"])
      expect(first.hasPendingWork()).toBe(false)
      expect(second.hasPendingWork()).toBe(false)

      // Which is what makes the next start quiet: no table records the run,
      // so "already done" has to be visible in the data itself.
      await expect(
        run(loadPendingMigrations(migrations))
      ).resolves.toMatchObject({ ok: true, value: [] })
    } finally {
      await dispose()
    }
  })

  test("a failing migration rejects instead of being reported as done", async () => {
    const { deps, dispose } = await createDeps()
    try {
      await using run = testCreateRun(deps)
      const reason = new Error("migration exploded")
      const failing: AppMigration = {
        name: "failing",
        hasWork: async () => ok(true),
        run: (async () => {
          throw reason
        }) as Task<unknown, never, EvoluDep & EvoluOwnerIdDep>,
      }

      // Evolu wraps what a Task throws rather than rethrowing it, so the
      // caller sees a panic carrying the defect and not the `Error` itself.
      // `AppMigrations` only needs it to reject — it logs whatever it caught
      // and shows the failure dialog.
      await expect(run.ok(runMigrations([failing]))).rejects.toMatchObject({
        reason: { defect: reason },
      })
    } finally {
      await dispose()
    }
  })

  /**
   * The tests above exercise the runner with synthetic migrations, and
   * `fio-plugin-fixed-id-migration.test.ts` covers that migration on its own.
   * Nothing tied the two together: the registry's one real entry could have
   * been dropped from `appMigrations` and `bun run check` would have stayed
   * green. This runs the real registry against the row shape the migration
   * exists for.
   */
  test("the registry's real migration is reached, runs, and then reports done", async () => {
    const { deps, dispose } = await createDeps()
    try {
      await using run = testCreateRun(deps)
      const { evolu } = deps
      const legacyId = createRowId<"FioPlugin">()

      // The pre-singleton shape: a plugin at a generated id rather than the
      // fixed `fioPluginId`, with its token keyed to that same id.
      await runMutationWithCompletion((options) => {
        const mutationOptions = { ...options, ownerId: evolu.appOwner.id }

        evolu.upsert(
          "fioPlugin",
          {
            id: legacyId,
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
            id: createRowId<"FioPluginToken">(),
            fioPluginId: legacyId,
            token: NonEmptyString255("fio-token-legacy"),
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      })

      const pending = await run.ok(loadPendingMigrations(appMigrations))
      expect(pending.map((migration) => migration.name)).toEqual([
        "2026-09-14-fio-plugin-fixed-id",
      ])

      await expect(run(runMigrations(pending))).resolves.toMatchObject({
        ok: true,
        value: 1,
      })

      await expect(
        run(loadPendingMigrations(appMigrations))
      ).resolves.toMatchObject({ ok: true, value: [] })
    } finally {
      await dispose()
    }
  }, 15_000)
  test("the registry reaches the account id migration and then reports done", async () => {
    const { deps, dispose } = await createDeps()
    try {
      await using run = testCreateRun(deps)
      const { evolu } = deps
      const legacyId = createRowId<"Account">()

      // A cash register at a random id, as `createAccount` minted them before
      // ids were derived from the currency.
      await runMutationWithCompletion((options) => {
        const mutationOptions = { ...options, ownerId: evolu.appOwner.id }

        evolu.upsert(
          "accountCashRegister",
          { id: legacyId, currency: "CZK" },
          mutationOptions
        )
        evolu.upsert(
          "account",
          {
            id: legacyId,
            deviceId: null,
            name: NonEmptyString255("Cash register"),
            kind: "cashRegister",
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      })

      const pending = await run.ok(loadPendingMigrations(appMigrations))
      expect(pending.map((migration) => migration.name)).toEqual([
        "2026-09-23-account-derived-id",
      ])

      await run.ok(runMigrations(pending))

      await expect(
        run(loadPendingMigrations(appMigrations))
      ).resolves.toMatchObject({ ok: true, value: [] })
    } finally {
      await dispose()
    }
  }, 15_000)
})

/** Accounts still carrying the name a test migration renames. */
const legacyNamedAccountsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("account")
    .select("id")
    .where("name", "=", NonEmptyString255("legacy"))
    .where("isDeleted", "is not", sqliteTrue)
)

/** Renames every "legacy" account: real device rows, so real device writes. */
const renameLegacyAccounts: DeviceMigration = {
  name: "test-rename-legacy-accounts",
  hasWork: async (run) =>
    ok(
      (await run.deps.deviceEvolu.loadQuery(legacyNamedAccountsQuery)).length >
        0
    ),
  run: async (run) => {
    const { deviceEvolu } = run.deps
    const rows = await deviceEvolu.loadQuery(legacyNamedAccountsQuery)
    await runMutationWithCompletion((options) => {
      for (const { id } of rows) {
        deviceEvolu.update(
          "account",
          { id, name: NonEmptyString255("renamed") },
          options
        )
      }
    })
    return ok(undefined)
  },
}

describe("device migrations", () => {
  test("run over the device database and leave no work behind", async () => {
    await using testDevice = await createTestDeviceEvolu()
    const { deviceEvolu } = testDevice
    await runMutationWithCompletion((options) => {
      deviceEvolu.insert(
        "account",
        {
          name: NonEmptyString255("legacy"),
          masterKey: MasterKey("000102030405060708090a0b0c0d0e0f"),
          lastUseAt: TimestampMs(1),
        },
        options
      )
    })
    await using run = testCreateRun({
      deviceEvolu,
      localStorage: createTestLocalStorage(),
    })

    const pending = await run.ok(loadPendingMigrations([renameLegacyAccounts]))
    expect(pending.map(({ name }) => name)).toEqual([
      "test-rename-legacy-accounts",
    ])
    expect(await run.ok(runMigrations(pending))).toBe(1)

    expect(await run.ok(loadPendingMigrations([renameLegacyAccounts]))).toEqual(
      []
    )
  })

  test("the registry has no work on a fresh device", async () => {
    await using testDevice = await createTestDeviceEvolu()
    await using run = testCreateRun({
      deviceEvolu: testDevice.deviceEvolu,
      localStorage: createTestLocalStorage(),
    })

    expect(await run.ok(loadPendingMigrations(deviceMigrations))).toEqual([])
  })
})
