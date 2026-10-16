import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createDeviceQuery } from "../evolu/device-client.ts"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import { NonEmptyString255 } from "../modules/shared/schema.ts"
import { createTestDeviceEvolu } from "../testing/device-evolu.ts"
import { createTestLocalStorage } from "../testing/local-storage.ts"
import { deviceIdMigration } from "./device-id-migration.ts"

const legacyId = "AAAAAAAAAAAAAAAAAAAAAA"

const deviceIdsQuery = createDeviceQuery((db) =>
  db.selectFrom("device").select("id").where("isDeleted", "is not", sqliteTrue)
)

describe("deviceIdMigration", () => {
  test("moves the device id out of localStorage into the device database", async () => {
    await using testDevice = await createTestDeviceEvolu()
    const { deviceEvolu } = testDevice
    const localStorage = createTestLocalStorage({ "payky.deviceId": legacyId })
    await using run = testCreateRun({ deviceEvolu, localStorage })

    expect(await run.ok(deviceIdMigration.hasWork)).toBe(true)
    await run.ok(deviceIdMigration.run)

    expect(await deviceEvolu.loadQuery(deviceIdsQuery)).toEqual([
      { id: legacyId },
    ])
    expect(localStorage.getItem("payky.deviceId")).toBeNull()
    expect(await run.ok(deviceIdMigration.hasWork)).toBe(false)
  })

  test("keeps a device row the device database already has", async () => {
    await using testDevice = await createTestDeviceEvolu()
    const { deviceEvolu } = testDevice
    const existing = await runMutationWithCompletion(
      (options) =>
        deviceEvolu.insert(
          "device",
          { name: NonEmptyString255("Till") },
          options
        ).id
    )
    const localStorage = createTestLocalStorage({ "payky.deviceId": legacyId })
    await using run = testCreateRun({ deviceEvolu, localStorage })

    await run.ok(deviceIdMigration.run)

    expect(await deviceEvolu.loadQuery(deviceIdsQuery)).toEqual([
      { id: existing },
    ])
    expect(localStorage.getItem("payky.deviceId")).toBeNull()
  })
})
