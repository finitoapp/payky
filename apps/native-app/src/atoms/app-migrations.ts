import {
  appMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@payky/core/migrations/migrations"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { deviceEvoluAtom } from "./device-evolu.ts"
import { evoluAtom } from "./evolu.ts"

export interface AppMigrationReport {
  readonly migrated: number
  readonly failed: boolean
}

/**
 * Runs the pending app-database migrations on every start (rows may arrive
 * later through sync, so there is no "ran once" flag). Ready means
 * `failed === false`; a failure is reported, not hidden as "no work".
 */
export const appMigrationsAtom = atom(
  async (get): Promise<AppMigrationReport> => {
    const evolu = await get(evoluAtom)
    const deviceEvolu = await get(deviceEvoluAtom)

    try {
      await using run = nativeRun.create({
        evolu,
        deviceEvolu,
        evoluOwner: evolu.appOwner,
      })
      const pending = await run.ok(loadPendingMigrations(appMigrations))
      if (pending.length === 0) return { migrated: 0, failed: false }

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
