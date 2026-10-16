import {
  createIdFromString,
  type MutationOptions,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common"
import type {
  CashuOperationId,
  KeysetId,
  MintUrl,
} from "../modules/cashu/cashu-types.ts"
import { NonNegativeInteger } from "../modules/shared/schema.ts"
import {
  type CashuClaimAttemptId,
  type CashuCounterId,
  type CashuKnownMintId,
  createDeviceQuery,
  type DeviceAccountId,
  type DeviceEvolu,
} from "./device-client.ts"

/**
 * This device's share of the Cashu wallet (cashu.md §3): its NUT-13
 * counters, the attempts it made, and the mints it has seen or added. None of
 * it syncs; Linky keeps its own the same way.
 */

/** One NUT-13 derivation tree: per mint, unit and keyset. */
export interface CashuCounterScope {
  readonly mint: MintUrl
  readonly unit: "sat"
  readonly keysetId: KeysetId
}

export const cashuCounterScopeKey = (scope: CashuCounterScope): string =>
  [scope.mint, scope.unit, scope.keysetId].join("|")

const counterId = (
  accountId: DeviceAccountId,
  scope: CashuCounterScope
): CashuCounterId =>
  createIdFromString<"CashuCounter">(
    `cashu-counter:${accountId}|${cashuCounterScopeKey(scope)}`
  )

const claimAttemptId = (
  accountId: DeviceAccountId,
  operationId: CashuOperationId
): CashuClaimAttemptId =>
  createIdFromString<"CashuClaimAttempt">(
    `cashu-claim-attempt:${accountId}|${operationId}`
  )

const knownMintId = (
  accountId: DeviceAccountId,
  mint: MintUrl
): CashuKnownMintId =>
  createIdFromString<"CashuKnownMint">(`cashu-known-mint:${accountId}|${mint}`)

export const cashuCounterQuery = (
  accountId: DeviceAccountId,
  scope: CashuCounterScope
) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("cashuCounter")
      .select(["next"])
      .where("id", "=", counterId(accountId, scope))
  )

export const cashuClaimAttemptQuery = (
  accountId: DeviceAccountId,
  operationId: CashuOperationId
) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("cashuClaimAttempt")
      .select(["counter"])
      .where("id", "=", claimAttemptId(accountId, operationId))
  )

export const cashuDeviceKnownMintsQuery = (accountId: DeviceAccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("cashuKnownMint")
      .select(["mint", "seen", "added"])
      .where("accountId", "=", accountId)
      .where("isDeleted", "is not", sqliteTrue)
  )

/**
 * Moves the counter to `next` unless it is already there or further: a
 * counter never moves back (a gap costs a restore scan, a reuse a mint
 * rejection). The caller holds the scope's lock and read `current` under it.
 */
export const advanceCashuCounter = (
  deviceEvolu: DeviceEvolu,
  {
    accountId,
    scope,
    current,
    next,
  }: {
    readonly accountId: DeviceAccountId
    readonly scope: CashuCounterScope
    readonly current: number | null
    readonly next: number
  },
  options?: MutationOptions
): void => {
  if (current !== null && next <= current) return
  deviceEvolu.upsert(
    "cashuCounter",
    {
      id: counterId(accountId, scope),
      accountId,
      scope: cashuCounterScopeKey(scope),
      next: NonNegativeInteger(next),
    },
    options
  )
}

export const recordCashuClaimAttempt = (
  deviceEvolu: DeviceEvolu,
  {
    accountId,
    operationId,
    counter,
  }: {
    readonly accountId: DeviceAccountId
    readonly operationId: CashuOperationId
    readonly counter: number
  },
  options?: MutationOptions
): void => {
  deviceEvolu.upsert(
    "cashuClaimAttempt",
    {
      id: claimAttemptId(accountId, operationId),
      accountId,
      operationId,
      counter: NonNegativeInteger(counter),
    },
    options
  )
}

export const markCashuMintSeen = (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  mint: MintUrl,
  options?: MutationOptions
): void => {
  deviceEvolu.upsert(
    "cashuKnownMint",
    {
      id: knownMintId(accountId, mint),
      accountId,
      mint,
      seen: sqliteTrue,
      isDeleted: sqliteFalse,
    },
    options
  )
}

export const addCashuMint = (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  mint: MintUrl,
  options?: MutationOptions
): void => {
  deviceEvolu.upsert(
    "cashuKnownMint",
    {
      id: knownMintId(accountId, mint),
      accountId,
      mint,
      added: sqliteTrue,
      isDeleted: sqliteFalse,
    },
    options
  )
}

/** Drops the mint from this device's seen and added mints only. */
export const removeCashuMint = (
  deviceEvolu: DeviceEvolu,
  accountId: DeviceAccountId,
  mint: MintUrl,
  options?: MutationOptions
): void => {
  deviceEvolu.update(
    "cashuKnownMint",
    { id: knownMintId(accountId, mint), isDeleted: sqliteTrue },
    options
  )
}
