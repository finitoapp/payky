import { ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { accountDerivedIdMigration } from "@/core/migrations/account-derived-id-migration.ts"
import { migrateLegacyFioPlugins } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { hasLegacyFioPluginQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

/**
 * One data migration, and the two things the runner needs from it.
 *
 * There is deliberately no table recording which migrations have run. In a
 * local-first database a "this already happened" flag is a claim about time,
 * and rows arrive by sync at an arbitrary later point: a device that wrote the
 * flag before its data synced would skip the migration forever, and one whose
 * flag has not synced yet would run it again for nothing. The only question
 * with a stable answer is `hasWork` — is there still data to migrate — so that
 * is the only one asked.
 *
 * Two consequences, both required of every entry here:
 *
 * - `hasWork` runs at every app start, forever, so it must be cheap. Prefer a
 *   dedicated `limit(1)` existence query over reusing the migration's own
 *   read, and keep the two agreeing on what counts as work — a `hasWork` that
 *   stays true after `run` finishes reopens the migration popup at every
 *   start.
 * - `run` must be re-runnable, not merely idempotent. Nothing records a
 *   partial run, so a crash halfway through simply leaves `hasWork` true and
 *   the next start does it again.
 */
export interface AppMigration {
  readonly name: string
  readonly hasWork: Task<boolean, never, EvoluDep>
  readonly run: Task<unknown, never, EvoluDep & EvoluOwnerIdDep>
}

declare global {
  interface Window {
    /**
     * Set by an e2e spec through `page.addInitScript` before the load it
     * should affect — see `e2e/support/migrations.ts`.
     */
    __e2eHoldMigrations?: boolean
    __e2eReleaseMigrations?: () => void
  }
}

/**
 * A migration that exists only to be watched.
 *
 * The real ones are a handful of local Evolu writes and finish in
 * milliseconds, which leaves the popup's running state impossible to
 * screenshot with any reliability — and there is nothing external to slow
 * down, since a migration touches no network. So the registry carries one
 * entry whose work *is* the waiting: `hasWork` is false unless an e2e spec
 * armed the flag, and `run` blocks until that spec releases it.
 *
 * Inert twice over in anything shipped. `import.meta.env.DEV` is false in
 * every `vite build` output and `__E2E_TEST_BUILD__` is true only in the
 * build `bun run test:e2e:preview` makes, so `hasWork` always answers false,
 * the entry is never pending, and `run` is never reached — the same gate, for
 * the same reason, as `E2eTestBridge`'s.
 */
const e2eHoldMigration: AppMigration = {
  name: "e2e-hold",
  hasWork: async () =>
    ok(
      (import.meta.env.DEV || __E2E_TEST_BUILD__) &&
        typeof window !== "undefined" &&
        window.__e2eHoldMigrations === true
    ),
  run: async () => {
    await new Promise<void>((resolve) => {
      window.__e2eReleaseMigrations = resolve
    })

    return ok(undefined)
  },
}

/**
 * Runs in this order; a later migration may depend on an earlier one.
 *
 * The hold comes first on purpose: while it blocks, the migrations after it
 * genuinely have not run yet, so what a screenshot captures is real work in
 * progress rather than a finished run with the popup still up.
 */
export const appMigrations: ReadonlyArray<AppMigration> = [
  e2eHoldMigration,
  {
    name: "2026-09-14-fio-plugin-fixed-id",
    hasWork: async (run) =>
      ok((await run.deps.evolu.loadQuery(hasLegacyFioPluginQuery)).length > 0),
    run: migrateLegacyFioPlugins(),
  },
  // After the Fio one: a legacy plugin it adopts can still point at the
  // legacy fiat bank account, and this is what re-points it.
  accountDerivedIdMigration,
]

/**
 * The migrations with something left to do. Separate from `runMigrations` so
 * the UI can find out whether there is any work *before* it opens a popup
 * about it — on the overwhelming majority of starts the answer is none, and
 * nothing should flash.
 */
export const loadPendingMigrations =
  (
    migrations: ReadonlyArray<AppMigration>
  ): Task<ReadonlyArray<AppMigration>, never, EvoluDep> =>
  async (run) => {
    const pending: AppMigration[] = []

    for (const migration of migrations) {
      if (await run.ok(migration.hasWork)) pending.push(migration)
    }

    return ok(pending)
  }

/** Runs the given migrations in order, one after another. */
export const runMigrations =
  (
    migrations: ReadonlyArray<AppMigration>
  ): Task<number, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    for (const migration of migrations) {
      await run.ok(migration.run)
    }

    return ok(migrations.length)
  }
