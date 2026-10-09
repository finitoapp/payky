import {
  createIdFromString,
  type InferRow,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"

import {
  createDeviceQuery,
  type DeviceAccountId,
  type DeviceEvolu,
  type PinAttemptBaseId,
} from "@/core/evolu/device-client.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  type TimestampMs,
} from "@/core/modules/shared/schema.ts"

/**
 * The failed PIN attempt log of one account on this device (access/0006),
 * oldest first. Read and written only by the PIN screen and by applying an
 * unblock token.
 */
export const pinAttemptsQuery = (accountId: DeviceAccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("pinAttempt")
      .select(["id", "attemptedAt", "target"])
      .where("accountId", "=", accountId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("attemptedAt", "is not", null)
      .where("target", "is not", null)
      .orderBy("attemptedAt")
      .orderBy("createdAt")
      .$narrowType<{ attemptedAt: KyselyNotNull; target: KyselyNotNull }>()
  )

export type PinAttemptRow = InferRow<ReturnType<typeof pinAttemptsQuery>>

const pinAttemptBaseId = (accountId: DeviceAccountId): PinAttemptBaseId =>
  createIdFromString<"PinAttemptBase">(`payky-pin-attempt-base:${accountId}`)

export const pinAttemptBaseQuery = (accountId: DeviceAccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("pinAttemptBase")
      .select(["unblockToken", "baseCount"])
      .where("id", "=", pinAttemptBaseId(accountId))
  )

export interface PinAttemptLog {
  readonly attempts: ReadonlyArray<PinAttemptRow>
  readonly unblockToken: string | null
  /** The attempts that count towards the block: those after the last unblock. */
  readonly failedInARow: number
}

export const loadPinAttemptLog = async (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId
): Promise<PinAttemptLog> => {
  const [attempts, [base]] = await Promise.all([
    deviceEvolu.loadQuery(pinAttemptsQuery(accountId)),
    deviceEvolu.loadQuery(pinAttemptBaseQuery(accountId)),
  ])
  return {
    attempts,
    unblockToken: base?.unblockToken ?? null,
    failedInARow: Math.max(0, attempts.length - (base?.baseCount ?? 0)),
  }
}

/** Awaited: the attempt must be on disk before the PIN is verified (rule 7). */
export const recordPinAttempt = (
  deviceEvolu: DeviceEvolu,
  attempt: {
    readonly accountId: DeviceAccountId
    readonly attemptedAt: TimestampMs
    readonly target: string
  }
) =>
  runMutationWithCompletion(
    (options) =>
      deviceEvolu.insert(
        "pinAttempt",
        {
          accountId: attempt.accountId,
          attemptedAt: attempt.attemptedAt,
          target: NonEmptyString255(attempt.target.slice(0, 255) || "?"),
        },
        options
      ).id
  )

/**
 * Removes attempts from the log — the correct one right after it verified,
 * or the whole log once the owner has seen it — and starts counting from
 * zero again. Skipped when there is nothing to remove, since an empty batch
 * never completes.
 */
export const removePinAttempts = async (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  ids: ReadonlyArray<PinAttemptRow["id"]>,
  { resetBase }: { readonly resetBase: boolean }
): Promise<void> => {
  if (ids.length === 0 && !resetBase) return
  await runMutationWithCompletion((options) => {
    for (const id of ids) {
      deviceEvolu.update("pinAttempt", { id, isDeleted: sqliteTrue }, options)
    }
    if (resetBase) {
      deviceEvolu.upsert(
        "pinAttemptBase",
        {
          id: pinAttemptBaseId(accountId),
          accountId,
          baseCount: NonNegativeInteger(0),
        },
        options
      )
    }
  })
}

/**
 * Applies an unblock written by another device (access/0006): attempts
 * logged so far stop counting, but stay in the log for the owner to see.
 */
export const applyPinUnblockToken = (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  token: string,
  logLength: number
) =>
  runMutationWithCompletion((options) =>
    deviceEvolu.upsert(
      "pinAttemptBase",
      {
        id: pinAttemptBaseId(accountId),
        accountId,
        unblockToken: NonEmptyString255(token),
        baseCount: NonNegativeInteger(logLength),
      },
      options
    )
  )
