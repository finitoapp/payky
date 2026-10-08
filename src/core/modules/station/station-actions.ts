import { err, ok, sqliteFalse, sqliteTrue, type Task } from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { createMasterKey } from "@/core/modules/shared/key-derivation.ts"
import {
  type NonEmptyString255,
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
  PositiveInteger,
  type Sha256Hex,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { maxStationNumber } from "./station-config-utils.ts"
import { getStationNostrPubkey } from "./station-identity-utils.ts"
import { lastStationNumberQuery, stationByIdQuery } from "./station-queries.ts"
import type { StationId } from "./station-types.ts"

const createStationNumbersExhaustedError = defineError(
  "StationNumbersExhausted"
)()
export type StationNumbersExhaustedError = ReturnType<
  typeof createStationNumbersExhaustedError
>

/**
 * Creates a PoS station with entropy of its own, which its link carries
 * (station/0001), and the next number, which prefixes its specific symbols
 * (station/0007). Numbers are never reused, so a revoked station's payments
 * keep theirs. Every payment method starts on: a method the owner has no
 * account for is left out of the config anyway.
 */
export const createStation =
  ({
    name,
  }: {
    readonly name: NonEmptyString255
  }): Task<
    StationId,
    StationNumbersExhaustedError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const [last] = await run.deps.evolu.loadQuery(lastStationNumberQuery)
    const number = (last?.number ?? 0) + 1
    if (number > maxStationNumber) {
      return err(createStationNumbersExhaustedError())
    }

    const masterKey = createMasterKey()
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert(
        "station",
        {
          name,
          number: PositiveInteger(number),
          masterKey,
          nostrPubkey: getStationNostrPubkey(masterKey),
          cashEnabled: sqliteTrue,
          ibanEnabled: sqliteTrue,
          sparkEnabled: sqliteTrue,
          configVersion: NonNegativeInteger(0),
        },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

export const renameStation =
  ({
    id,
    name,
  }: {
    readonly id: StationId
    readonly name: NonEmptyString255
  }): Task<StationId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "station",
        { id, name },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

/**
 * Which of the owner's payment methods a station offers. Lightning pays the
 * owner's live Spark wallet (station/0003).
 */
export const setStationPaymentMethods =
  ({
    id,
    cash,
    iban,
    spark,
  }: {
    readonly id: StationId
    readonly cash?: boolean
    readonly iban?: boolean
    readonly spark?: boolean
  }): Task<StationId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const toSqlite = (value: boolean | undefined) =>
      value === undefined ? undefined : value ? sqliteTrue : sqliteFalse

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "station",
        removeUndefinedValues({
          id,
          cashEnabled: toSqlite(cash),
          ibanEnabled: toSqlite(iban),
          sparkEnabled: toSqlite(spark),
        }),
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

/**
 * Revokes a station for good (station/0005): its reports are no longer
 * accepted, and it is told to log out. There is no undo; a new station is a
 * new link.
 */
export const revokeStation =
  (
    id: StationId
  ): Task<StationId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const [station] = await run.deps.evolu.loadQuery(stationByIdQuery(id))
    if (station === undefined || station.revokedAt !== null) return ok(id)

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "station",
        {
          id,
          revokedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
        },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(id)
  }

/**
 * Notes that a station was heard from: when, the config it applies and the
 * newest report seq it has.
 */
export const recordStationContact =
  ({
    id,
    configHash,
    lastSeq,
  }: {
    readonly id: StationId
    readonly configHash: Sha256Hex | null
    readonly lastSeq: number
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const [station] = await run.deps.evolu.loadQuery(stationByIdQuery(id))
    if (station === undefined) return ok()

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "station",
        {
          id,
          lastSeenAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
          ackedConfigHash: configHash,
          reportedLastSeq: NonNegativeInteger(
            Math.max(station.reportedLastSeq ?? 0, lastSeq)
          ),
        },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok()
  }

/**
 * Names the config a station is now to run on: the next version, under the
 * hash of its JSON (station/0008).
 */
export const setStationConfigHash =
  ({
    id,
    hash,
  }: {
    readonly id: StationId
    readonly hash: Sha256Hex
  }): Task<NonNegativeIntegerType, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const [station] = await run.deps.evolu.loadQuery(stationByIdQuery(id))
    if (station === undefined || station.configHash === hash) {
      return ok(station?.configVersion ?? NonNegativeInteger(0))
    }
    const version = NonNegativeInteger(station.configVersion + 1)

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "station",
        { id, configVersion: version, configHash: hash },
        { ...options, ownerId: run.deps.evoluOwnerId }
      )
    )
    return ok(version)
  }
