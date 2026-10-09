import {
  err,
  type LockManagerDep,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { z } from "zod"

import type { DateDep, EvoluOwnerIdDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { DeviceAccountId } from "@/core/evolu/device-client.ts"
import {
  applyPinUnblockToken,
  loadPinAttemptLog,
  type PinAttemptRow,
  recordPinAttempt,
  removePinAttempts,
} from "@/core/evolu/device-pin-attempts.ts"
import { accessControlQuery } from "@/core/modules/access/access-queries.ts"
import {
  accessControlId,
  maxFailedPinAttempts,
  type Permission,
} from "@/core/modules/access/access-types.ts"
import {
  decodePinHash,
  hashPin,
  type Pin,
  PinHashJson,
  recoveryPhraseMatches,
  verifyPin,
} from "@/core/modules/access/access-utils.ts"
import {
  setDevicePinBlocked,
  updateDeviceDefaultPermissions,
} from "@/core/modules/device/device-actions.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import type {
  DeviceEvoluDep,
  EvoluDep,
} from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { TimestampMs } from "@/core/modules/shared/schema.ts"

const createNoPinError = defineError("NoPin")()
export type NoPinError = ReturnType<typeof createNoPinError>

/**
 * Switches access control on (access/0001) in one batch with the PIN and the
 * turn-on wizard's device defaults (access/0004): otherwise every existing
 * device, all `null`, would stop working, the owner's own included. `pin`
 * `null` keeps the PIN set before, which must still decode.
 */
export const enableAccessControl =
  ({
    pin,
    devices,
  }: {
    readonly pin: Pin | null
    readonly devices: ReadonlyArray<{
      readonly id: DeviceId
      readonly permissions: ReadonlyArray<Permission>
    }>
  }): Task<void, NoPinError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    let encodedPin: string | undefined
    if (pin === null) {
      const [row] = await evolu.loadQuery(accessControlQuery)
      if (decodePinHash(row?.pin ?? null) === null) {
        return err(createNoPinError())
      }
    } else {
      encodedPin = z.encode(PinHashJson, await hashPin(pin))
    }

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }
      if (encodedPin === undefined) {
        evolu.update(
          "accessControl",
          { id: accessControlId, enabled: sqliteTrue },
          mutationOptions
        )
      } else {
        evolu.upsert(
          "accessControl",
          { id: accessControlId, enabled: sqliteTrue, pin: encodedPin },
          mutationOptions
        )
      }
      for (const device of devices) {
        updateDeviceDefaultPermissions(evolu, device, mutationOptions)
      }
    })
    return ok()
  }

/** Keeps the PIN: turning access control on again can reuse it (rule 2). */
export const disableAccessControl =
  (): Task<void, never, EvoluDep & EvoluOwnerIdDep> => async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await runMutationWithCompletion((options) =>
      evolu.update(
        "accessControl",
        { id: accessControlId, enabled: sqliteFalse },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }

/** Replaces the PIN; it is never cleared (rule 2). */
export const changePin =
  (pin: Pin): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const encodedPin = z.encode(PinHashJson, await hashPin(pin))
    await runMutationWithCompletion((options) =>
      evolu.update(
        "accessControl",
        { id: accessControlId, pin: encodedPin },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok()
  }

const createPinBlockedError = defineError("PinBlocked")()
export type PinBlockedError = ReturnType<typeof createPinBlockedError>

const createWrongPinError = defineError("WrongPin")<{
  readonly attemptsLeft: number
}>()
export type WrongPinError = ReturnType<typeof createWrongPinError>

export interface PinEntryTarget {
  readonly accountId: DeviceAccountId
  readonly deviceId: DeviceId
  /** What the attempt tried to unlock, for the owner to read (rule 9). */
  readonly target: string
}

type PinEntryDeps = EvoluDep &
  EvoluOwnerIdDep &
  DeviceEvoluDep &
  LockManagerDep &
  DateDep

/**
 * Checks a PIN typed at this device (access/0006). Under one lock per
 * account, so two tabs cannot both pass the block check: a blocked device
 * never verifies; otherwise the attempt is logged and the write awaited
 * *before* verifying, so killing the app on "wrong PIN" cannot hide it. A
 * correct PIN takes its own attempt back out and returns the failed ones
 * before it, which the owner sees before `clearPinAttemptLog` (rule 9).
 */
export const enterPin =
  ({
    pin,
    accountId,
    deviceId,
    target,
  }: PinEntryTarget & {
    readonly pin: string
  }): Task<
    ReadonlyArray<PinAttemptRow>,
    PinBlockedError | WrongPinError,
    PinEntryDeps
  > =>
  async (run) =>
    await run.deps.lockManager.request(`payky-pin-${accountId}`, async () => {
      const { deviceEvolu, evolu, date } = run.deps
      const before = await loadPinAttemptLog(deviceEvolu, accountId)
      if (before.failedInARow >= maxFailedPinAttempts) {
        return err(createPinBlockedError())
      }

      const attemptId = await recordPinAttempt(deviceEvolu, {
        accountId,
        attemptedAt: TimestampMs(date.now().getTime()),
        target,
      })

      const [row] = await evolu.loadQuery(accessControlQuery)
      const stored = decodePinHash(row?.pin ?? null)
      if (stored !== null && (await verifyPin(pin, stored))) {
        await removePinAttempts(deviceEvolu, accountId, [attemptId], {
          resetBase: false,
        })
        return ok(before.attempts)
      }

      const failedInARow = before.failedInARow + 1
      if (failedInARow >= maxFailedPinAttempts) {
        await run.ok(setDevicePinBlocked({ id: deviceId, blocked: true }))
        return err(createPinBlockedError())
      }
      return err(
        createWrongPinError({
          attemptsLeft: maxFailedPinAttempts - failedInARow,
        })
      )
    })

const createWrongRecoveryPhraseError = defineError("WrongRecoveryPhrase")()
export type WrongRecoveryPhraseError = ReturnType<
  typeof createWrongRecoveryPhraseError
>

/**
 * The seed fallback (rule 8): works on a blocked device too, and a wrong
 * phrase is not a failed attempt — a 20-word phrase cannot be guessed at
 * the counter. A match returns the failed attempt log to show.
 */
export const enterRecoveryPhrase =
  ({
    phrase,
    accountId,
  }: {
    readonly phrase: string
    readonly accountId: DeviceAccountId
  }): Task<
    ReadonlyArray<PinAttemptRow>,
    WrongRecoveryPhraseError,
    DeviceEvoluDep & MasterKeyDep
  > =>
  async (run) => {
    const { deviceEvolu, masterKey } = run.deps
    if (!(await recoveryPhraseMatches(phrase, masterKey))) {
      return err(createWrongRecoveryPhraseError())
    }
    const log = await loadPinAttemptLog(deviceEvolu, accountId)
    return ok(log.attempts)
  }

/**
 * Clears the log once the owner has seen it after a correct PIN or phrase,
 * which also unblocks the device (rule 7). Only the owner gets this far, so
 * nobody else can clear it.
 */
export const clearPinAttemptLog =
  ({
    accountId,
    deviceId,
  }: {
    readonly accountId: DeviceAccountId
    readonly deviceId: DeviceId
  }): Task<void, never, PinEntryDeps> =>
  async (run) =>
    await run.deps.lockManager.request(`payky-pin-${accountId}`, async () => {
      const { deviceEvolu } = run.deps
      const log = await loadPinAttemptLog(deviceEvolu, accountId)
      await removePinAttempts(
        deviceEvolu,
        accountId,
        log.attempts.map((attempt) => attempt.id),
        { resetBase: true }
      )
      await run.ok(setDevicePinBlocked({ id: deviceId, blocked: false }))
      return ok()
    })

/**
 * Applies an unblock another device wrote to this device's row
 * (access/0006), once per token: attempts logged so far stop counting
 * towards the block but stay in the log, which only the owner clears.
 */
export const applyPinUnblock =
  ({
    accountId,
    deviceId,
    token,
  }: {
    readonly accountId: DeviceAccountId
    readonly deviceId: DeviceId
    readonly token: string
  }): Task<void, never, PinEntryDeps> =>
  async (run) =>
    await run.deps.lockManager.request(`payky-pin-${accountId}`, async () => {
      const { deviceEvolu } = run.deps
      const log = await loadPinAttemptLog(deviceEvolu, accountId)
      if (log.unblockToken === token) return ok()
      await applyPinUnblockToken(
        deviceEvolu,
        accountId,
        token,
        log.attempts.length
      )
      await run.ok(setDevicePinBlocked({ id: deviceId, blocked: false }))
      return ok()
    })
