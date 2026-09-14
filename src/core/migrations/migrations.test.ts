import { ok, type Task, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import {
  type AppMigration,
  loadPendingMigrations,
  runMigrations,
} from "@/core/migrations/migrations.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../evolu/cli-client"

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
    deps: { evolu, evoluOwnerId: evolu.appOwner.id },
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
})
