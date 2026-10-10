import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import {
  registerDevice,
  removeDevice,
  renameDevice,
  setDeviceDefaultPermissions,
} from "@/core/modules/device/device-actions.ts"
import {
  deviceByIdQuery,
  devicesQuery,
} from "@/core/modules/device/device-queries.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"

const deviceId: DeviceId = createIdFromString("test-device")

const register = (name: string) =>
  registerDevice({
    id: deviceId,
    name: NonEmptyString255(name),
    deviceType: NonEmptyString255("tablet"),
    browserName: null,
    osName: NonEmptyString255("Android"),
  })

describe("device rows", () => {
  test("registering again keeps the name and permissions the owner set", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))

    await run.ok(register("Random Otter"))
    await run.ok(
      renameDevice({ id: deviceId, name: NonEmptyString255("Front till") })
    )
    await run.ok(
      setDeviceDefaultPermissions({ id: deviceId, permissions: ["sell"] })
    )
    await run.ok(register("Another Random Name"))

    expect(await evolu.loadQuery(devicesQuery)).toMatchObject([
      {
        id: deviceId,
        name: "Front till",
        osName: "Android",
        defaultPermissions: '["sell"]',
      },
    ])
  })

  test("removing a device clears its permissions, so it comes back with none", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(evoluTestDeps(evolu))
    await run.ok(register("Till"))
    await run.ok(
      setDeviceDefaultPermissions({
        id: deviceId,
        permissions: ["sell", "admin"],
      })
    )

    await run.ok(removeDevice(deviceId))
    expect(await evolu.loadQuery(devicesQuery)).toEqual([])

    await run.ok(register("Till"))
    expect(await evolu.loadQuery(deviceByIdQuery(deviceId))).toMatchObject([
      { isDeleted: 0, defaultPermissions: null },
    ])
  })
})
