import { err, type LockManagerDep, type Result } from "@evolu/common"
import {
  advanceCashuCounter,
  type CashuCounterScope,
  cashuCounterQuery,
  cashuCounterScopeKey,
} from "../evolu/device-cashu.ts"
import type { DeviceEvoluDep } from "../modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import { restoreKeyset } from "./cashu-restore.ts"
import type { CashuShardStoreDep } from "./cashu-shard-store.ts"
import {
  type CashuWalletDep,
  CounterLockTimeout,
  type CounterLockTimeoutError,
  callMint,
  type LoadedCashuWallet,
  type MintFailure,
  mintErrorCode,
} from "./cashu-wallet.ts"

/**
 * NUT-13 counters, as Linky's (`linkshu/src/internal/counters.ts`,
 * `collisionRecovery.ts`), kept per device in the device database:
 *
 * - one per `mint|unit|keysetId`; it never moves back, and slot 0 is never
 *   used (cashu-ts reads a counter of 0 as "pick one yourself");
 * - an attempt reserves blocks of 64 slots under the scope's lock;
 * - Payky's one difference from Linky: before this device's first operation
 *   at a keyset it runs Linky's restore for that keyset and starts past the
 *   last signed slot, instead of at 1 against a wallet Linky has advanced.
 *
 * The locks serialise Payky's own work only; nothing spans Payky and Linky.
 * The mint's answers, the synced counter on the operation and NUT-09 protect
 * across apps.
 */

/** Slots one deterministic attempt reserves: Linky's `QUOTE_OUTPUT_BLOCK`. */
export const CASHU_OUTPUT_BLOCK = 64
/** NUT-09 window scanned for the last signed slot past a collision. */
const COLLISION_RESTORE_WINDOW = 100
/** Linky's 30 s before a counter lock gives up. */
const COUNTER_LOCK_TIMEOUT_MS = 30_000

export type CashuCounterDeps = CashuWalletDep &
  CashuShardStoreDep &
  DeviceEvoluDep &
  LockManagerDep

export const counterScopeOf = (
  loaded: Pick<LoadedCashuWallet, "mint">,
  keysetId: CashuCounterScope["keysetId"]
): CashuCounterScope => ({ mint: loaded.mint, unit: "sat", keysetId })

/** The stored counter, or null when this device never used the scope. */
const readCounter = async (
  deps: CashuCounterDeps,
  scope: CashuCounterScope
): Promise<number | null> => {
  const [row] = await deps.deviceEvolu.loadQuery(
    cashuCounterQuery(deps.cashuWallet.deviceAccountId, scope)
  )
  return row === undefined || row.next === null ? null : row.next
}

const writeCounter = async (
  deps: CashuCounterDeps,
  scope: CashuCounterScope,
  current: number | null,
  next: number
): Promise<void> => {
  if (current !== null && next <= current) return
  await runMutationWithCompletion((options) =>
    advanceCashuCounter(
      deps.deviceEvolu,
      { accountId: deps.cashuWallet.deviceAccountId, scope, current, next },
      options
    )
  )
}

/** What a callback holding a scope's lock may do with its counter. */
export interface HeldCashuCounter {
  /** The next free slot, never 0. */
  readonly current: () => number
  /** Moves the counter to at least `next`; never back. */
  readonly advanceTo: (next: number) => Promise<number>
}

/**
 * Runs `work` holding the scope's counter lock (Payky's own, per device).
 * The first use of a scope on this device restores the keyset first.
 */
export const withCashuCounter = async <T, E>(
  deps: CashuCounterDeps,
  loaded: LoadedCashuWallet,
  scope: CashuCounterScope,
  work: (counter: HeldCashuCounter) => Promise<Result<T, E>>
): Promise<Result<T, E | MintFailure | CounterLockTimeoutError>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), COUNTER_LOCK_TIMEOUT_MS)
  try {
    return await deps.lockManager.request(
      `cashu-counter:${deps.cashuWallet.deviceAccountId}|${cashuCounterScopeKey(scope)}`,
      { signal: controller.signal },
      async () => {
        clearTimeout(timeout)
        let stored = await readCounter(deps, scope)
        if (stored === null) {
          const restored = await restoreKeyset(
            loaded,
            deps.cashuShardStore,
            scope.keysetId,
            0
          )
          if (!restored.ok) return restored
          const first = Math.max(1, restored.value.nextCounter ?? 1)
          await writeCounter(deps, scope, null, first)
          stored = first
        }
        let current = Math.max(1, stored)
        return await work({
          current: () => current,
          advanceTo: async (next) => {
            const target = Math.max(current, Math.floor(next))
            await writeCounter(deps, scope, current, target)
            current = target
            return current
          },
        })
      }
    )
  } catch (error) {
    if (controller.signal.aborted)
      return err(
        CounterLockTimeout({ mint: scope.mint, keysetId: scope.keysetId })
      )
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
 * Linky's `recoverFromCollision`: past "already signed" or "duplicate
 * outputs" a NUT-09 probe of 100 slots finds the last signed one and the
 * counter jumps after it; past anything else (11004, ambiguous) it jumps
 * `fallbackBump`. Returns the counter now in effect.
 */
export const recoverFromCollision = async (
  loaded: LoadedCashuWallet,
  scope: CashuCounterScope,
  held: HeldCashuCounter,
  counter: number,
  error: unknown,
  fallbackBump: number = CASHU_OUTPUT_BLOCK
): Promise<number> => {
  const lastSigned =
    isOutputsAlreadySignedError(error) || isDuplicateOutputsError(error)
      ? await callMint(loaded.mint, () =>
          loaded.wallet.restore(counter, COLLISION_RESTORE_WINDOW, {
            keysetId: scope.keysetId,
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

/** Linky's limit on attempts per operation before giving up for this run. */
export const MAX_COUNTER_ATTEMPTS = 5
