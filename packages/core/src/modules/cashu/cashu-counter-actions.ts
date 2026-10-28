import {
  err,
  type LockManagerDep,
  type MutationOptions,
  ok,
  type Task,
} from "@evolu/common"
import {
  type CashuWalletDep,
  callMint,
  type LoadedCashuWallet,
  mintErrorCode,
} from "../../cashu/cashu-wallet.ts"
import type { EvoluOwnerDep } from "../../deps.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import {
  type CounterLockTimeoutError,
  createCounterLockTimeoutError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  keepUnstoredUnspent,
  sumCashuAmounts,
  toNewCashuProofs,
  updateCashuOperation,
  upsertCashuProofRows,
} from "./cashu-proof-actions.ts"
import { cashuCounterQuery } from "./cashu-queries.ts"
import type { CashuOperationId, KeysetId, MintUrl } from "./cashu-types.ts"
import { cashuClaimAttemptIdFor, cashuCounterIdFor } from "./cashu-utils.ts"

/**
 * NUT-13 counters (cashu/0015), kept per device in the local-only
 * `_cashuCounter`:
 *
 * - one per `mint|sat|keysetId`; it never moves back, and slot 0 is never
 *   used (cashu-ts reads a counter of 0 as "pick one yourself");
 * - an attempt reserves blocks of 64 slots under the scope's lock;
 * - before this device's first operation at a keyset it restores the keyset
 *   (NUT-09) and starts past the last signed slot, so another Payky device's
 *   work is never re-derived.
 *
 * The locks serialise this device's own work only. The mint's answers, the
 * synced counter on the operation and NUT-09 protect across devices.
 */

/** Slots one deterministic attempt reserves. */
export const CASHU_OUTPUT_BLOCK = 64
/** Attempts per operation before giving up for this run. */
export const MAX_COUNTER_ATTEMPTS = 5
/** NUT-09 window scanned for the last signed slot past a collision. */
const COLLISION_RESTORE_WINDOW = 100
/** How long a counter lock may be waited for. */
const COUNTER_LOCK_TIMEOUT_MS = 30_000
/** Consecutive empty positions a restore scan tolerates before it stops. */
const RESTORE_GAP_LIMIT = 300
/** Positions per restore request. */
const RESTORE_BATCH_SIZE = 100

export type CashuCounterDeps = CashuWalletDep &
  EvoluDep &
  EvoluOwnerDep &
  LockManagerDep

const advanceCounter = (
  evolu: Evolu,
  {
    mint,
    keysetId,
    next,
  }: {
    readonly mint: MintUrl
    readonly keysetId: KeysetId
    readonly next: number
  },
  options?: MutationOptions
): void => {
  evolu.upsert(
    "_cashuCounter",
    {
      id: cashuCounterIdFor(mint, keysetId),
      mintUrl: mint,
      keysetId,
      next: NonNegativeInteger(next),
    },
    options
  )
}

/** What a Task holding a scope's lock may do with its counter. */
export interface HeldCashuCounter {
  /** The next free slot, never 0. */
  readonly current: () => number
  /** Moves the counter to at least `next`; never back. */
  readonly advanceTo: (next: number) => Promise<number>
  /**
   * Reserves the block at `counter` for the operation, in one batch before
   * the outputs are derived: this device's attempt, the operation's synced
   * counter and keyset, and the local counter past the block.
   */
  readonly reserve: (
    operationId: CashuOperationId,
    counter: number
  ) => Promise<void>
}

export interface CashuKeysetRestore {
  readonly restoredAmount: number
  /** The first slot after the last one the mint has signed; null for none. */
  readonly nextCounter: number | null
}

/**
 * NUT-09 restore of one keyset: walks the derivation tree in batches until
 * the mint answers a gap of empty positions, and stores as `available` the
 * proofs the wallet does not hold that the mint reports unspent.
 */
export const restoreCashuKeyset =
  (
    loaded: LoadedCashuWallet,
    keysetId: KeysetId,
    from: number
  ): Task<
    CashuKeysetRestore,
    MintFailure,
    CashuWalletDep & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const { evoluOwner } = run.deps
    const scanned = await callMint(loaded.mint, () =>
      loaded.wallet.batchRestore(
        RESTORE_GAP_LIMIT,
        RESTORE_BATCH_SIZE,
        from,
        keysetId
      )
    )
    if (!scanned.ok) return scanned
    const last = scanned.value.lastCounterWithSignature
    const nextCounter =
      typeof last === "number" && Number.isFinite(last) ? last + 1 : null
    const kept = await run(keepUnstoredUnspent(loaded, scanned.value.proofs))
    // A failed state check imports nothing: an unconfirmed proof would show as
    // balance the wallet cannot spend. The counter still moves past the scan.
    const rows =
      (kept.ok ? toNewCashuProofs(kept.value, loaded.mint) : []) ?? []
    if (rows.length > 0)
      await runMutationWithCompletion((options) =>
        upsertCashuProofRows(
          run.deps.evolu,
          rows,
          { state: "available", operationId: null },
          { ...options, owner: evoluOwner }
        )
      )
    return ok({ restoredAmount: sumCashuAmounts(rows), nextCounter })
  }

/**
 * Runs `work` holding the counter lock of `loaded.mint|sat|keysetId`. The
 * first use of the scope on this device restores the keyset first.
 */
export const withCashuCounter =
  <T, E, D>(
    loaded: LoadedCashuWallet,
    keysetId: KeysetId,
    work: (held: HeldCashuCounter) => Task<T, E, D>
  ): Task<T, E | MintFailure | CounterLockTimeoutError, D & CashuCounterDeps> =>
  async (run) => {
    const { evolu, evoluOwner, lockManager } = run.deps
    const mint = loaded.mint
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      COUNTER_LOCK_TIMEOUT_MS
    )
    try {
      return await lockManager.request(
        `cashu-counter:${evolu.appOwner.id}|${mint}|sat|${keysetId}`,
        { signal: controller.signal },
        async () => {
          clearTimeout(timeout)
          const [row] = await evolu.loadQuery(cashuCounterQuery(mint, keysetId))
          const stored = row?.next ?? null
          const start = await (async () => {
            if (stored !== null) return ok(Math.max(1, stored))
            const restored = await run(restoreCashuKeyset(loaded, keysetId, 0))
            if (!restored.ok) return restored
            const first = Math.max(1, restored.value.nextCounter ?? 1)
            await runMutationWithCompletion((options) =>
              advanceCounter(
                evolu,
                { mint, keysetId, next: first },
                { ...options, owner: evoluOwner }
              )
            )
            return ok(first)
          })()
          if (!start.ok) return start
          // The one mutable cell: the counter as this lock holder moved it.
          let current = start.value
          const advanceTo = async (next: number): Promise<number> => {
            const target = Math.max(current, Math.floor(next))
            if (target > current)
              await runMutationWithCompletion((options) =>
                advanceCounter(
                  evolu,
                  { mint, keysetId, next: target },
                  { ...options, owner: evoluOwner }
                )
              )
            current = target
            return current
          }
          return await run(
            work({
              current: () => current,
              advanceTo,
              reserve: async (operationId, counter) => {
                const next = Math.max(current, counter + CASHU_OUTPUT_BLOCK)
                await runMutationWithCompletion((options) => {
                  const mutationOptions = { ...options, owner: evoluOwner }

                  evolu.upsert(
                    "_cashuClaimAttempt",
                    {
                      id: cashuClaimAttemptIdFor(operationId),
                      operationId,
                      counter: NonNegativeInteger(counter),
                    },
                    mutationOptions
                  )
                  updateCashuOperation(
                    evolu,
                    operationId,
                    { counter: NonNegativeInteger(counter), keysetId },
                    mutationOptions
                  )
                  advanceCounter(
                    evolu,
                    { mint, keysetId, next },
                    mutationOptions
                  )
                })
                current = next
              },
            })
          )
        }
      )
    } catch (error) {
      if (controller.signal.aborted)
        return err(createCounterLockTimeoutError({ mint, keysetId }))
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

/** NUT-00 11003/11005: these outputs were signed before. */
export const isOutputsAlreadySignedError = (error: unknown): boolean => {
  const code = mintErrorCode(error)
  if (code === 11003 || code === 11005) return true
  const message = (error instanceof Error ? error.message : "").toLowerCase()
  return (
    message.includes("outputs have already been signed") ||
    message.includes("outputs already signed") ||
    message.includes("already been signed before") ||
    message.includes("keyset id already signed")
  )
}

/** CDK's 11008 for outputs colliding with stored promises. */
export const isDuplicateOutputsError = (error: unknown): boolean =>
  mintErrorCode(error) === 11008 ||
  (error instanceof Error ? error.message : "")
    .toLowerCase()
    .includes("duplicate outputs")

const isOutputsPendingError = (error: unknown): boolean => {
  if (mintErrorCode(error) === 11004) return true
  const message = (error instanceof Error ? error.message : "").toLowerCase()
  return (
    message.includes("outputs are pending") ||
    message.includes("output is pending")
  )
}

/** A failure the attempt loop recovers from by moving the counter. */
export const isRecoverableOutputCollision = (error: unknown): boolean =>
  isOutputsAlreadySignedError(error) ||
  isOutputsPendingError(error) ||
  isDuplicateOutputsError(error)

/** NUT-07's definitive rejection of spent inputs (11001). */
export const isTokenAlreadySpentError = (error: unknown): boolean =>
  mintErrorCode(error) === 11001 ||
  (error instanceof Error ? error.message : "")
    .toLowerCase()
    .includes("already spent")

/**
 * Past "already signed" or "duplicate outputs" a NUT-09 probe of 100 slots
 * finds the last signed one and the counter jumps after it; past anything
 * else (11004, ambiguous) it jumps `fallbackBump`. Returns the counter now
 * in effect.
 */
export const recoverFromCollision = async (
  loaded: LoadedCashuWallet,
  keysetId: KeysetId,
  held: HeldCashuCounter,
  counter: number,
  error: unknown,
  fallbackBump: number = CASHU_OUTPUT_BLOCK
): Promise<number> => {
  const lastSigned =
    isOutputsAlreadySignedError(error) || isDuplicateOutputsError(error)
      ? await callMint(loaded.mint, () =>
          loaded.wallet.restore(counter, COLLISION_RESTORE_WINDOW, {
            keysetId,
          })
        )
      : null
  const last =
    lastSigned?.ok === true &&
    typeof lastSigned.value.lastCounterWithSignature === "number"
      ? lastSigned.value.lastCounterWithSignature
      : null
  return held.advanceTo(last === null ? counter + fallbackBump : last + 1)
}
