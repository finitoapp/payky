import { ok, sqliteTrue } from "@evolu/common"

import { createDeviceQuery } from "@/core/evolu/device-client.ts"
import type { DeviceMigration } from "@/core/migrations/migrations.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import { createRandomDisplayName } from "@/lib/random-name.ts"

const legacyDeviceIdKey = "payky.deviceId"

const deviceRowQuery = createDeviceQuery((db) =>
  db
    .selectFrom("device")
    .select("id")
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .limit(1)
)

/**
 * Moves the device id from `localStorage` into the device database, where
 * the device id lives (access/0004), so the device keeps its id and with it
 * its default permissions. A device database that already has its device
 * row keeps it; the `localStorage` copy is dropped either way.
 */
export const deviceIdMigration: DeviceMigration = {
  name: "2026-10-08-device-id-into-device-database",
  hasWork: async (run) =>
    ok(run.deps.localStorage.getItem(legacyDeviceIdKey) !== null),
  run: async (run) => {
    const { deviceEvolu, localStorage } = run.deps
    const legacyId = DeviceId.safeParse(localStorage.getItem(legacyDeviceIdKey))
    const [existing] = await deviceEvolu.loadQuery(deviceRowQuery)
    if (existing === undefined && legacyId.success) {
      await runMutationWithCompletion((options) =>
        deviceEvolu.upsert(
          "device",
          {
            id: legacyId.data,
            name: NonEmptyString255(createRandomDisplayName()),
          },
          options
        )
      )
    }
    localStorage.removeItem(legacyDeviceIdKey)
    return ok()
  },
}
