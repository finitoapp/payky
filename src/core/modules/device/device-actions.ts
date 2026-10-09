import {
  type MutationOptions,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { Evolu } from "@/core/evolu/schema.ts"
import type { Permission } from "@/core/modules/access/access-types.ts"
import { encodePermissions } from "@/core/modules/access/access-utils.ts"
import { deviceByIdQuery } from "@/core/modules/device/device-queries.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { NonEmptyString255, TimestampMs } from "@/core/modules/shared/schema.ts"

/**
 * Puts this device's row into the active account's app database on start
 * (access/0004). Never writes `defaultPermissions`, `pinBlockedAt` or
 * `pinUnblockToken`, and `name` only for a new row: Evolu resolves each
 * column last-write-wins, so writing them on every start would undo what
 * the owner set. A row the owner removed comes back — with the permissions
 * the removal cleared, which is none.
 */
export const registerDevice =
  (device: {
    readonly id: DeviceId
    readonly name: NonEmptyString255
    readonly deviceType: NonEmptyString255 | null
    readonly browserName: NonEmptyString255 | null
    readonly osName: NonEmptyString255 | null
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const [existing] = await evolu.loadQuery(deviceByIdQuery(device.id))
    const labels = {
      id: device.id,
      deviceType: device.deviceType,
      browserName: device.browserName,
      osName: device.osName,
    }

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }
      if (existing === undefined) {
        evolu.upsert(
          "device",
          { ...labels, name: device.name },
          mutationOptions
        )
      } else {
        evolu.update(
          "device",
          { ...labels, isDeleted: sqliteFalse },
          mutationOptions
        )
      }
    })
    return ok()
  }

/**
 * The plain write, for a caller folding it into its own batch, as
 * `enableAccessControl` does with the turn-on wizard's devices.
 */
export const updateDeviceDefaultPermissions = (
  evolu: Evolu,
  device: {
    readonly id: DeviceId
    readonly permissions: Iterable<Permission>
  },
  options: MutationOptions
) =>
  evolu.update(
    "device",
    {
      id: device.id,
      defaultPermissions: encodePermissions(device.permissions),
    },
    options
  )

export const setDeviceDefaultPermissions =
  (device: {
    readonly id: DeviceId
    readonly permissions: Iterable<Permission>
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) =>
      updateDeviceDefaultPermissions(evolu, device, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok()
  }

export const renameDevice =
  ({
    id,
    name,
  }: {
    readonly id: DeviceId
    readonly name: NonEmptyString255
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) =>
      evolu.update(
        "device",
        { id, name },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }

/** Written only by the device itself, so the others can show it blocked. */
export const setDevicePinBlocked =
  ({
    id,
    blocked,
  }: {
    readonly id: DeviceId
    readonly blocked: boolean
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evolu, evoluOwnerId, date } = run.deps
    await runMutationWithCompletion((options) =>
      evolu.update(
        "device",
        {
          id,
          pinBlockedAt: blocked ? TimestampMs(date.now().getTime()) : null,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }

/**
 * Unblocks a blocked device from another one (access/0006). A fresh random
 * token rather than a time, so changing the blocked device's clock cannot
 * make later attempts look older than the unblock.
 */
export const unblockDevice =
  (id: DeviceId): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) =>
      evolu.update(
        "device",
        {
          id,
          pinUnblockToken: NonEmptyString255(bytesToHex(randomBytes(16))),
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }

/**
 * Removes a device row and its permissions together, so a device that is
 * still alive and registers itself again comes back with none (access/0004).
 */
export const removeDevice =
  (id: DeviceId): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) =>
      evolu.update(
        "device",
        { id, defaultPermissions: null, isDeleted: sqliteTrue },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }
