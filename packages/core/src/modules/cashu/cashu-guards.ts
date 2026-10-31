import { ok, sqliteTrue, type Task } from "@evolu/common"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  type CashuMeltRow,
  type CashuOperationSnapshot,
  type CashuReceiveRow,
  type CashuTopupRow,
  cashuMeltQuery,
  cashuOperationAttemptsQuery,
  cashuOperationQuery,
  cashuReceiveQuery,
  cashuTopupQuery,
} from "./cashu-queries.ts"
import type {
  CashuAttemptRole,
  CashuOperationAttemptId,
  CashuOperationId,
  CashuOperationKind,
  CashuOperationStatus,
  KeysetId,
} from "./cashu-types.ts"

/**
 * The read side of the Cashu actions: an operation's current state and
 * whose attempts it carries (cashu/0029). These read and return `Result`;
 * they never write.
 */

interface OperationStatusColumns {
  readonly kind: CashuOperationKind
  readonly status: CashuOperationStatus
  readonly settledAt: number | null
}

/**
 * The status the devices agree on (cashu/0022). `status` is last-write-wins
 * per cell, and two devices write one receive (cashu/0029), so another
 * device's late `pending` can outrank a `done`. `settledAt` is written only
 * by the batch that completes an operation and never cleared, so it decides.
 * A receive is never closed `failed` (cashu/0029): one written before reads
 * `pending`.
 */
const withSettledStatus = <Row extends OperationStatusColumns>(
  row: Row
): Row =>
  row.settledAt !== null
    ? { ...row, status: row.kind === "melt" ? "paid" : "done" }
    : row.kind === "receive" && row.status === "failed"
      ? { ...row, status: "pending" }
      : row

const loadFirst =
  <Row extends OperationStatusColumns>(
    load: (deps: EvoluDep) => Promise<ReadonlyArray<Row>>
  ): Task<Row | null, never, EvoluDep> =>
  async (run) => {
    const [row] = await load(run.deps)
    return ok(row === undefined ? null : withSettledStatus(row))
  }

export const loadCashuOperation = (
  id: CashuOperationId
): Task<CashuOperationSnapshot | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuOperationQuery(id)))

export const loadCashuTopup = (
  id: CashuOperationId
): Task<CashuTopupRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuTopupQuery(id)))

export const loadCashuReceive = (
  id: CashuOperationId
): Task<CashuReceiveRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuReceiveQuery(id)))

export const loadCashuMelt = (
  id: CashuOperationId
): Task<CashuMeltRow | null, never, EvoluDep> =>
  loadFirst((deps) => deps.evolu.loadQuery(cashuMeltQuery(id)))

/** One call's NUT-13 slots for an operation (cashu/0029, cashu/0039). */
export interface CashuAttempt {
  readonly id: CashuOperationAttemptId
  readonly keysetId: KeysetId
  /** The first slot of the call's outputs. */
  readonly counter: number
  /** How many outputs the call asks for, from `counter`. */
  readonly slots: number
  readonly role: CashuAttemptRole
  /** The mint refused the call made with it: nothing signed (cashu/0029). */
  readonly rejected: boolean
  /** A contest over it gave outputs to no one (cashu/0029). */
  readonly contested: boolean
  /** Made by this device. */
  readonly own: boolean
  /**
   * When it was reserved, by Evolu's timestamp of its write: what orders
   * attempts of different keysets, whose counters say nothing about each
   * other.
   */
  readonly createdAt: string
  /**
   * Made by this device to fence a melt (cashu/0019): a melt whose only
   * attempts here are fences was taken over, not sent, here (cashu/0027).
   */
  readonly ownFence: boolean
}

/** Every attempt any device made for the operation, lowest slot first. */
export const loadCashuAttempts =
  (
    operationId: CashuOperationId
  ): Task<ReadonlyArray<CashuAttempt>, never, EvoluDep> =>
  async (run) => {
    const rows = await run.deps.evolu.loadQuery(
      cashuOperationAttemptsQuery(operationId)
    )
    return ok(
      rows.map((row) => ({
        id: row.id,
        keysetId: row.keysetId,
        counter: row.counter,
        slots: row.slots,
        role: row.role,
        rejected: row.isRejected === sqliteTrue,
        contested: row.isContested === sqliteTrue,
        own: row.ownId !== null,
        createdAt: row.createdAt,
        ownFence: row.ownIsFence === sqliteTrue,
      }))
    )
  }

/**
 * How long another device's attempt is left to that device before this one
 * takes it over: reclaims its outputs, or claims in its place (cashu/0029,
 * cashu/0017). Long enough for a device still working on it to finish and
 * sync.
 */
export const CLAIMED_ELSEWHERE_GRACE_MS = 5 * 60_000

/** The attempts the mint did not refuse: a refused block holds nothing. */
const liveAttempts = (
  attempts: ReadonlyArray<CashuAttempt>
): ReadonlyArray<CashuAttempt> =>
  attempts.filter((attempt) => !attempt.rejected)

/**
 * Another Payky device is working on it: the operation carries another
 * device's attempt the mint did not refuse, and none of this device's
 * (cashu/0029). A refused attempt of another device's is no work of its;
 * one of this device's, refused or not, means this device works on it too.
 */
export const isClaimedElsewhere = (
  attempts: ReadonlyArray<CashuAttempt>
): boolean =>
  liveAttempts(attempts).some((attempt) => !attempt.own) &&
  !attempts.some((attempt) => attempt.own)

const lastOf = (attempts: ReadonlyArray<CashuAttempt>): CashuAttempt | null =>
  attempts[attempts.length - 1] ?? null

/**
 * The latest of attempts that may span keysets: the last reserved, by
 * Evolu's timestamp, and in one keyset the highest slot, as a device's
 * counter never moves back there. A counter alone would rank an old
 * keyset's high slot above a newer keyset's first ones.
 */
const latestOf = (attempts: ReadonlyArray<CashuAttempt>): CashuAttempt | null =>
  attempts.reduce<CashuAttempt | null>(
    (latest, attempt) =>
      latest === null ||
      attempt.createdAt > latest.createdAt ||
      (attempt.createdAt === latest.createdAt &&
        attempt.keysetId === latest.keysetId &&
        attempt.counter > latest.counter)
        ? attempt
        : latest,
    null
  )

/**
 * This device's latest attempt the mint did not refuse, in `keysetId` when
 * given: a device's counter never moves back, so its highest slot there is
 * its latest. Across keysets the last reserved is (`latestOf`). A refused
 * one signed nothing to resume or restore (cashu/0029).
 */
export const latestOwnAttempt = (
  attempts: ReadonlyArray<CashuAttempt>,
  keysetId?: KeysetId
): CashuAttempt | null => {
  const own = attempts.filter(
    (attempt) =>
      attempt.own &&
      !attempt.rejected &&
      (keysetId === undefined || attempt.keysetId === keysetId)
  )
  return keysetId === undefined ? latestOf(own) : lastOf(own)
}

/**
 * The latest attempt of `role` in `keysetId` that the mint did not refuse,
 * whichever device made it: a melt's swaps and its request are told apart
 * by their role, on any device that resumes it (cashu/0027, cashu/0039).
 */
export const latestCashuAttempt = (
  attempts: ReadonlyArray<CashuAttempt>,
  keysetId: KeysetId,
  role: CashuAttemptRole
): CashuAttempt | null =>
  lastOf(
    attempts.filter(
      (attempt) =>
        !attempt.rejected &&
        attempt.keysetId === keysetId &&
        attempt.role === role
    )
  )

/**
 * The latest attempt another device made that the mint did not refuse, in
 * any keyset, by the same reasoning (cashu/0029).
 */
export const latestOtherAttempt = (
  attempts: ReadonlyArray<CashuAttempt>
): CashuAttempt | null =>
  latestOf(liveAttempts(attempts).filter((attempt) => !attempt.own))
