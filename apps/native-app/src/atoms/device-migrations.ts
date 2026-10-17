import {
  deviceMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@payky/core/migrations/migrations"
import { atom } from "jotai"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { noLegacyLocalStorage } from "../platform/no-legacy-local-storage.ts"
import { deviceEvoluAtom } from "./device-evolu.ts"

export interface DeviceMigrationReport {
  readonly migrated: number
  readonly failed: boolean
}

/**
 * Runs the pending device-database migrations before the active account is
 * read. Never rejects, as on web: a failure is logged and reported, and the
 * app still starts.
 */
export const deviceMigrationsAtom = atom(
  async (get): Promise<DeviceMigrationReport> => {
    const deviceEvolu = await get(deviceEvoluAtom)

    try {
      await using run = nativeRun.create({
        deviceEvolu,
        localStorage: noLegacyLocalStorage,
      })
      const pending = await run.ok(loadPendingMigrations(deviceMigrations))
      if (pending.length === 0) return { migrated: 0, failed: false }

      nativeConsole.info("Running device data migrations.", {
        names: pending.map((migration) => migration.name),
      })
      return { migrated: await run.ok(runMigrations(pending)), failed: false }
    } catch (error) {
      nativeConsole.error("Device data migration failed.", error)
      return { migrated: 0, failed: true }
    }
  }
)
