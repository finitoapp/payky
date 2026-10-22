import type { Evolu } from "@payky/core/evolu/schema"
import {
  type AppMigration,
  appMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@payky/core/migrations/migrations"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { evoluAtom } from "./evolu.ts"

export interface AppMigrationReport {
  readonly migrated: number
  readonly failed: boolean
}

const createMigrationRun = (evolu: Evolu) =>
  nativeRun.create({ evolu, evoluOwner: evolu.appOwner })

/**
 * The app-database migrations with work on this start, or `null` when asking
 * failed. Apart from running them, so `AppMigrations` can tell before it opens
 * its popup whether there is anything to report, as web's check does.
 */
export const pendingAppMigrationsAtom = atom(
  async (get): Promise<ReadonlyArray<AppMigration> | null> => {
    const evolu = await get(evoluAtom)

    try {
      await using run = createMigrationRun(evolu)
      return await run.ok(loadPendingMigrations(appMigrations))
    } catch (error) {
      nativeConsole.error("Data migration failed.", error)
      return null
    }
  }
)

/**
 * Runs the pending app-database migrations on every start (rows may arrive
 * later through sync, so there is no "ran once" flag). Ready means
 * `failed === false`; a failure is reported, not hidden as "no work".
 */
export const appMigrationsAtom = atom(
  async (get): Promise<AppMigrationReport> => {
    const pending = await get(pendingAppMigrationsAtom)
    if (pending === null) return { migrated: 0, failed: true }
    if (pending.length === 0) return { migrated: 0, failed: false }
    const evolu = await get(evoluAtom)

    try {
      await using run = createMigrationRun(evolu)
      nativeConsole.info("Running data migrations.", {
        names: pending.map((migration) => migration.name),
      })
      return { migrated: await run.ok(runMigrations(pending)), failed: false }
    } catch (error) {
      nativeConsole.error("Data migration failed.", error)
      return { migrated: 0, failed: true }
    }
  }
)
