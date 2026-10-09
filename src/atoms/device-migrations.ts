import { createRun } from "@evolu/web"
import { atom } from "jotai"

import { consoleAtom } from "@/atoms/console.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  deviceMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@/core/migrations/migrations.ts"

export interface DeviceMigrationReport {
  readonly migrated: number
  readonly failed: boolean
}

/**
 * Runs the pending device-database migrations once per app start, before
 * `activeAccountRowAtom` reads the active account — a migration may change
 * the account rows themselves. Never rejects: a failure is logged and
 * reported in `AppMigrations`' dialog, and the app starts anyway: a device
 * that cannot boot is worse than one running on unmigrated data.
 */
export const deviceMigrationsAtom = atom(
  async (get): Promise<DeviceMigrationReport> => {
    const deviceEvolu = await get(deviceEvoluAtom)
    const console = get(consoleAtom)

    try {
      await using run = createRun({ console, deviceEvolu, localStorage })
      const pending = await run.ok(loadPendingMigrations(deviceMigrations))
      if (pending.length === 0) return { migrated: 0, failed: false }

      console.info("Running device data migrations.", {
        names: pending.map((migration) => migration.name),
      })
      return { migrated: await run.ok(runMigrations(pending)), failed: false }
    } catch (error) {
      console.error("Device data migration failed.", error)
      return { migrated: 0, failed: true }
    }
  }
)
