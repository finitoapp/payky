import { type InferRow, type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"

const deviceColumns = [
  "id",
  "name",
  "deviceType",
  "browserName",
  "osName",
  "defaultPermissions",
  "pinBlockedAt",
  "pinUnblockToken",
] as const

/** Every device of the account that has synced its row (access/0004). */
export const devicesQuery = createQuery((db) =>
  db
    .selectFrom("device")
    .select(deviceColumns)
    .where("isDeleted", "is not", sqliteTrue)
    .where("name", "is not", null)
    .orderBy("name")
    .$narrowType<{ name: KyselyNotNull }>()
)

export type DeviceListRow = InferRow<typeof devicesQuery>

/** A device row, a removed one included. */
export const deviceByIdQuery = (id: DeviceId) =>
  createQuery((db) =>
    db
      .selectFrom("device")
      .select([...deviceColumns, "isDeleted"])
      .where("id", "=", id)
  )
