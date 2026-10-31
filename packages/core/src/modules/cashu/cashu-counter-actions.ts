import type { Proof } from "@cashu/cashu-ts"
import {
  err,
  type LockManagerDep,
  type MutationOptions,
  ok,
  type Result,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { readMintAnswer } from "../../cashu/cashu-mint-errors.ts"
import {
  type CashuWalletDep,
  callMint,
  checkProofStates,
  ensureCashuKeysets,
  type LoadedCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { AppOwnerSyncDep, EvoluOwnerDep } from "../../deps.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "../shared/evolu-utils.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import {
  type CashuReclaimAmbiguousError,
  type CounterLockTimeoutError,
  createCashuReclaimAmbiguousError,
  createCounterLockTimeoutError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  type CashuAttempt,
  loadCashuMelt,
  loadCashuReceive,
  loadCashuTopup,
} from "./cashu-guards.ts"
import {
  keepUnstoredUnspent,
  sumCashuAmounts,
  toNewCashuProofs,
  toWalletProofs,
  upsertCashuProofIdentities,
} from "./cashu-proof-actions.ts"
import {
  cashuAttemptsEndQuery,
  cashuCounterQuery,
  cashuLiveAttemptsAtKeysetQuery,
  cashuOperationAttemptsQuery,
  cashuOverlappingAttemptsQuery,
  heldCashuProofsOfOperationQuery,
  storedCashuProofIdsQuery,
} from "./cashu-queries.ts"
import type {
  CashuAttemptRole,
  CashuOperationAttemptId,
  CashuOperationId,
  CashuOperationKind,
  CashuOperationStatus,
  KeysetId,
  MintUrl,
} from "./cashu-types.ts"
import { cashuCounterIdFor, cashuProofIdFor } from "./cashu-utils.ts"

/**
 * NUT-13 counters (cashu/0029), kept per device in the local-only
 * `_cashuCounter`:
 *
 * - one per `mint|sat|keysetId`; it never moves back, and slot 0 is never
 *   used (cashu-ts reads a counter of 0 as "pick one yourself");
 * - a call is prepared first and then reserves exactly the slots its outputs
 *   take, under the scope's lock (cashu/0039); each reservation goes on
 *   record as a `cashuOperationAttempt` every device reads, with the call's
 *   role, one row per device: two devices reserving the same slots write two
 *   rows, so one device's refused call never marks the other's;
 * - before this device's first operation at a keyset it scans the keyset
 *   (NUT-09) and starts past the last signed slot, so another Payky device's
 *   work is never re-derived; once synced, it stores the scan's orphans,
 *   leaving every output in an open operation's block to that operation
 *   (cashu/0031);
 * - every time it takes the lock, and again past a collision, it moves past
 *   every block on record at the keyset, whichever device reserved it
 *   (cashu/0031);
 * - a block the mint refused, or one the mint's state shows holds nothing
 *   for the operation, is marked so, and a reclaim gives a block shared
 *   with an open operation only to the one whose call could have signed it
 *   (cashu/0029).
 *
 * The locks serialise this device's own work only. The mint's answers, the
 * attempts on record and NUT-09 protect across devices.
 */

/**
 * A slot count past any call's outputs: where a melt's pre-swap prepares its
 * kept outputs while it learns how many slots its sent ones take
 * (cashu/0039), and how far a collision moves the counter when the mint
 * shows no signed slot.
 */
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
  LockManagerDep &
  AppOwnerSyncDep

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
   * Reserves the slots of one prepared call at `counter` for the operation,
   * in one batch before the mint is called: the attempt on record for every
   * device, this device's mark on it, and the local counter past the slots.
   * `slots` is the number of outputs the call asks for and `role` which call
   * it is (cashu/0039). `alsoWrite` folds the caller's own rows into that
   * batch, ahead of the reservation. `fence` marks it, on this device only,
   * as a melt's fence (cashu/0019).
   */
  readonly reserve: (
    operationId: CashuOperationId,
    counter: number,
    reservation: {
      readonly slots: number
      readonly role: CashuAttemptRole
      readonly alsoWrite?: (options: MutationOptions) => void
      readonly fence?: boolean
    }
  ) => Promise<void>
  /**
   * The mint refused the one call of `role` made with the block this run
   * reserved at `counter`, so it signed nothing there for the operation
   * (cashu/0029). Only for a block reserved fresh: one resumed or taken over
   * may hold an earlier call's outputs.
   */
  readonly reject: (
    operationId: CashuOperationId,
    counter: number,
    role: CashuAttemptRole
  ) => Promise<void>
}

export interface CashuKeysetScan {
  /** Every output the mint signed in the scanned range, whoever's. */
  readonly proofs: ReadonlyArray<Proof>
  /** The first slot after the last one the mint has signed; null for none. */
  readonly nextCounter: number | null
}

/**
 * NUT-09 scan of one keyset: walks the derivation tree in batches from
 * `from` until the mint answers a gap of empty positions. Stores nothing:
 * where the counter goes is one question, whose the signatures are another
 * (cashu/0031).
 */
export const scanCashuKeyset =
  (
    loaded: LoadedCashuWallet,
    keysetId: KeysetId,
    from: number
  ): Task<CashuKeysetScan, MintFailure, CashuWalletDep> =>
  async () => {
    const operable = await ensureCashuKeysets(loaded, [keysetId])
    if (!operable.ok) return operable
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
    return ok({
      proofs: scanned.value.proofs,
      nextCounter:
        typeof last === "number" && Number.isFinite(last) ? last + 1 : null,
    })
  }

/**
 * An operation that still holds its blocks: a receive until it settles, a
 * topup or melt while `pending` (cashu/0029). A row not synced in yet holds
 * them too.
 */
const isOpenCashuOperation = (operation: {
  readonly kind: CashuOperationKind | null
  readonly status: CashuOperationStatus | null
  readonly settledAt: number | null
}): boolean =>
  operation.settledAt === null &&
  (operation.kind === "receive" ||
    operation.status === null ||
    operation.status === "pending")

/**
 * Stores the orphans among `scanned`: the outputs no open operation's block
 * not refused holds (cashu/0031). An output in such a block belongs to that
 * operation, which reclaims and books it; one anywhere else was signed for
 * an operation whose rows are gone, or for another wallet on the seed, and
 * comes back unbooked. Only proofs the wallet does not hold and the mint
 * reports unspent are stored, by their identity alone (cashu/0024).
 */
export const recoverOrphanCashuProofs =
  (
    loaded: LoadedCashuWallet,
    keysetId: KeysetId,
    scanned: ReadonlyArray<Proof>
  ): Task<number, MintFailure, CashuWalletDep & EvoluDep & EvoluOwnerDep> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    if (scanned.length === 0) return ok(0)
    const blocks = [
      ...new Map(
        (await evolu.loadQuery(cashuLiveAttemptsAtKeysetQuery(keysetId)))
          .filter(isOpenCashuOperation)
          .map((attempt) => [`${attempt.counter}|${attempt.slots}`, attempt])
      ).values(),
    ]
    const owned = await Promise.all(
      blocks.map((block) => restoreBlock(loaded, { ...block, keysetId }))
    )
    const ownedSecrets = new Set<string>()
    for (const restored of owned) {
      if (!restored.ok) return restored
      for (const proof of restored.value.proofs) ownedSecrets.add(proof.secret)
    }
    const kept = await run(
      keepUnstoredUnspent(
        loaded,
        scanned.filter((proof) => !ownedSecrets.has(proof.secret))
      )
    )
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(run.deps, kept.value, loaded.mint)
    if (rows.length > 0)
      await runMutationWithCompletion((options) =>
        upsertCashuProofIdentities(evolu, rows, {
          ...options,
          owner: evoluOwner,
        })
      )
    return ok(sumCashuAmounts(rows))
  }

/**
 * Runs `work` holding the counter lock of `loaded.mint|sat|keysetId`. The
 * first use of the scope on this device scans the keyset first, and the
 * counter starts past what the mint signed and past every block on record
 * there. Once this device has synced, the scan's orphans are recovered,
 * once per keyset (cashu/0031): before, an operation whose
 * attempt has not arrived could not be told from none.
 */
export const withCashuCounter =
  <T, E, D>(
    loaded: LoadedCashuWallet,
    keysetId: KeysetId,
    work: (held: HeldCashuCounter) => Task<T, E, D>,
    {
      ifBusy,
    }: {
      /**
       * Waits for no one: while another call holds the lock, `work` does not
       * run and this is the answer.
       */
      readonly ifBusy?: () => T
    } = {}
  ): Task<T, E | MintFailure | CounterLockTimeoutError, D & CashuCounterDeps> =>
  async (run) => {
    const { evolu, evoluOwner, lockManager, appOwnerSync } = run.deps
    const mint = loaded.mint
    const name = `cashu-counter:${evolu.appOwner.id}|${mint}|sat|${keysetId}`
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      COUNTER_LOCK_TIMEOUT_MS
    )
    try {
      const holding = async (): Promise<
        Result<T, E | MintFailure | CounterLockTimeoutError>
      > => {
        clearTimeout(timeout)
        const [row] = await evolu.loadQuery(cashuCounterQuery(mint, keysetId))
        const stored = row?.next ?? null
        // Past every block on record, any device's (cashu/0031): a device
        // behind the others skips their blocks instead of colliding with
        // each one in turn.
        const recordedEnd = async (): Promise<number> => {
          const [end] = await evolu.loadQuery(cashuAttemptsEndQuery(keysetId))
          return end?.end ?? 1
        }
        const recovering =
          row?.orphansRecovered !== sqliteTrue &&
          appOwnerSync.state().type === "complete"
        const scan =
          stored === null || recovering
            ? await run(scanCashuKeyset(loaded, keysetId, 0))
            : null
        // A first use cannot place its counter without the scan; a later
        // one that only recovers tries again on the next.
        if (scan !== null && !scan.ok && stored === null) return scan
        const start =
          stored ?? (scan?.ok === true ? (scan.value.nextCounter ?? 1) : 1)
        // A call of another role may start at the same slot, a fence after
        // a melt request that asked for no change: its row is its own, so
        // the request stays on record as sent (cashu/0039).
        const ownAttemptAt = async (
          operationId: CashuOperationId,
          counter: number,
          role: CashuAttemptRole
        ): Promise<CashuOperationAttemptId | null> =>
          (
            await evolu.loadQuery(cashuOperationAttemptsQuery(operationId))
          ).find(
            (attempt) =>
              attempt.ownId !== null &&
              attempt.keysetId === keysetId &&
              attempt.counter === counter &&
              attempt.role === role
          )?.id ?? null
        // The one mutable cell: the counter as this lock holder moved it.
        let current = stored ?? 0
        const advanceTo = async (next: number): Promise<number> => {
          const target = Math.max(
            current,
            Math.floor(next),
            await recordedEnd()
          )
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
        await advanceTo(Math.max(1, start))
        if (recovering && scan?.ok === true) {
          const recovered = await run(
            recoverOrphanCashuProofs(loaded, keysetId, scan.value.proofs)
          )
          if (recovered.ok)
            await runMutationWithCompletion((options) =>
              evolu.update(
                "_cashuCounter",
                {
                  id: cashuCounterIdFor(mint, keysetId),
                  orphansRecovered: sqliteTrue,
                },
                { ...options, owner: evoluOwner }
              )
            )
        }
        return await run(
          work({
            current: () => current,
            advanceTo,
            reserve: async (operationId, counter, reservation) => {
              const { slots, role } = reservation
              const next = Math.max(current, counter + slots)
              // This device's row for the block when it reserved it
              // before, a resume; else a row of its own (cashu/0029).
              const id =
                (await ownAttemptAt(operationId, counter, role)) ??
                createRowId<"CashuOperationAttempt">()
              await runMutationWithCompletion((options) => {
                const mutationOptions = { ...options, owner: evoluOwner }

                reservation.alsoWrite?.(mutationOptions)

                evolu.upsert(
                  "cashuOperationAttempt",
                  {
                    id,
                    operationId,
                    keysetId,
                    counter: NonNegativeInteger(counter),
                    slots: NonNegativeInteger(slots),
                    role,
                  },
                  mutationOptions
                )
                evolu.upsert(
                  "_cashuOwnAttempt",
                  {
                    id,
                    operationId,
                    ...(reservation.fence === true
                      ? { isFence: sqliteTrue }
                      : {}),
                  },
                  mutationOptions
                )
                advanceCounter(evolu, { mint, keysetId, next }, mutationOptions)
              })
              current = next
            },
            reject: async (operationId, counter, role) => {
              const id = await ownAttemptAt(operationId, counter, role)
              if (id === null) return
              await runMutationWithCompletion((options) =>
                evolu.update(
                  "cashuOperationAttempt",
                  { id, isRejected: sqliteTrue },
                  { ...options, owner: evoluOwner }
                )
              )
            },
          })
        )
      }
      return await (ifBusy === undefined
        ? lockManager.request(name, { signal: controller.signal }, holding)
        : lockManager.request(name, { ifAvailable: true }, (lock) =>
            lock === null ? ok(ifBusy()) : holding()
          ))
    } catch (error) {
      if (controller.signal.aborted)
        return err(createCounterLockTimeoutError({ mint, keysetId }))
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

/** An attempt's block: the keyset, its first slot and its size. */
interface CashuBlock {
  readonly keysetId: KeysetId
  readonly counter: number
  readonly slots: number
}

const blockKeyOf = (block: CashuBlock): string =>
  `${block.keysetId}|${block.counter}|${block.slots}`

/**
 * The rows of the operation naming one of `blocks`, whichever device wrote
 * them, that do not carry `mark` yet: `isRejected` when nothing in that
 * block is left for the operation, for good (cashu/0029); `isContested`
 * when a contest over it gave outputs to no one (cashu/0029).
 */
const unmarkedRowsOf = async (
  evolu: Evolu,
  operationId: CashuOperationId,
  blocks: ReadonlyArray<CashuBlock>,
  mark: "isRejected" | "isContested"
): Promise<ReadonlyArray<CashuOperationAttemptId>> => {
  const keys = new Set(blocks.map(blockKeyOf))
  return (await evolu.loadQuery(cashuOperationAttemptsQuery(operationId)))
    .filter((row) => row[mark] !== sqliteTrue && keys.has(blockKeyOf(row)))
    .map((row) => row.id)
}

/**
 * Whether the mint's state still leaves `operationId`'s call as one that
 * could have signed its slots, asked after the restores that showed them
 * signed and its first slot (cashu/0029): a receive's swap whose token is
 * not unspent, a topup's mint whose quote is not `UNPAID`. A mint signs a
 * quote's outputs before it reads `ISSUED`, so a `PAID` one may be signing
 * right now. A melt's swap, unless every proof it holds is unspent: the
 * pre-swap spends its sources, and once stored its own outputs are no one's
 * to contest. A melt request's blank outputs, unless its quote is `UNPAID`:
 * change is signed only with the payment. The attempt's role tells the calls
 * apart (cashu/0039). A slot is signed once, so a call that had not signed by
 * then never signs there. An operation whose rows have not synced in always
 * could have.
 */
const couldHaveSigned =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    kind: CashuOperationKind | null,
    role: CashuAttemptRole
  ): Task<boolean, MintFailure, CashuWalletDep & EvoluDep> =>
  async (run) => {
    if (kind === "melt" && role === "meltSwap") {
      const held = await run.deps.evolu.loadQuery(
        heldCashuProofsOfOperationQuery(operationId)
      )
      if (held.length === 0) return ok(true)
      const states = await checkProofStates(loaded, toWalletProofs(held))
      if (!states.ok) return states
      return ok(states.value.some((state) => state !== "unspent"))
    }
    if (kind === "melt" && role === "meltChange") {
      const melt = await run.ok(loadCashuMelt(operationId))
      if (melt === null) return ok(true)
      const quote = await callMint(loaded.mint, () =>
        loaded.wallet.checkMeltQuoteBolt11(melt.quoteId)
      )
      if (!quote.ok)
        return quote.error.type === "MintUnreachable" ? quote : ok(true)
      return ok(quote.value.state !== "UNPAID")
    }
    if (kind === "receive") {
      const receive = await run.ok(loadCashuReceive(operationId))
      const proofs = (() => {
        if (receive === null) return null
        try {
          return loaded.wallet.decodeToken(receive.tokenText).proofs
        } catch {
          return null
        }
      })()
      if (proofs === null) return ok(true)
      const states = await checkProofStates(loaded, proofs)
      if (!states.ok) return states
      return ok(states.value.some((state) => state !== "unspent"))
    }
    if (kind === "topup") {
      const topup = await run.ok(loadCashuTopup(operationId))
      if (topup === null) return ok(true)
      const quote = await callMint(loaded.mint, () =>
        loaded.wallet.checkMintQuoteBolt11(topup.quoteId)
      )
      if (!quote.ok)
        return quote.error.type === "MintUnreachable" ? quote : ok(true)
      return ok(quote.value.state !== "UNPAID")
    }
    return ok(true)
  }

/** NUT-09 over a block; one of no slots, a request with no change, holds nothing. */
const restoreBlock = (
  loaded: LoadedCashuWallet,
  block: CashuBlock
): Promise<Result<{ readonly proofs: ReadonlyArray<Proof> }, MintFailure>> =>
  block.slots === 0
    ? Promise.resolve(ok({ proofs: [] }))
    : callMint(loaded.mint, () =>
        loaded.wallet.restore(block.counter, block.slots, {
          keysetId: block.keysetId,
        })
      )

/**
 * What the mint said during one reclaim that stays true for good: a block's
 * first slot signed, a call that could have signed (cashu/0029). Only these
 * are kept. A "not signed" or "never signed" answer holds only for the moment
 * it was read, so it is asked again wherever it decides something.
 */
interface CashuMintFacts {
  readonly closedBlocks: Set<string>
  readonly signingCalls: Set<string>
}

const createCashuMintFacts = (): CashuMintFacts => ({
  closedBlocks: new Set(),
  signingCalls: new Set(),
})

/**
 * Whether no call can sign in the block any more: its first slot is
 * signed, and a call's outputs start there and are signed all or none.
 */
const isClosedToCalls = async (
  loaded: LoadedCashuWallet,
  facts: CashuMintFacts,
  block: CashuBlock
): Promise<Result<boolean, MintFailure>> => {
  const key = blockKeyOf(block)
  if (facts.closedBlocks.has(key)) return ok(true)
  const first = await restoreBlock(loaded, { ...block, slots: 1 })
  if (!first.ok) return first
  const closed = first.value.proofs.length > 0
  if (closed) facts.closedBlocks.add(key)
  return ok(closed)
}

/**
 * How an open operation sharing the reclaimed block's signed slots stands
 * there (cashu/0029):
 *
 * - `contests`: its call could have signed them;
 * - `refused`: its call never signed them, and no call of its can sign in
 *   its block any more (ground 3);
 * - `yields`: its call never signed them, but one may still sign in its
 *   block, which it keeps.
 *
 * Its block's first slot decides first, restored after the slots it shares
 * were seen signed. Unsigned, its call signed none of them, whatever its
 * state says: a call's outputs start at that slot and are signed all at
 * once, so a call signing later finds the shared slots taken. Signed, the
 * operation's state is asked after that restore, so it always comes after
 * the restore it judges. A call that signs its first slot in between reads
 * as one that could have signed: a contest, never a refusal of the block
 * holding its outputs.
 */
type CashuSharingVerdict = "contests" | "refused" | "yields"

const judgeSharingOperation =
  (
    loaded: LoadedCashuWallet,
    facts: CashuMintFacts,
    other: {
      readonly operationId: CashuOperationId
      readonly kind: CashuOperationKind | null
      readonly role: CashuAttemptRole
      readonly block: CashuBlock
    }
  ): Task<CashuSharingVerdict, MintFailure, CashuWalletDep & EvoluDep> =>
  async (run) => {
    const closed = await isClosedToCalls(loaded, facts, other.block)
    if (!closed.ok) return closed
    if (!closed.value) return ok("yields")
    const call = `${other.operationId}|${other.role}`
    if (!facts.signingCalls.has(call)) {
      const could = await run(
        couldHaveSigned(loaded, other.operationId, other.kind, other.role)
      )
      if (!could.ok) return could
      if (could.value) facts.signingCalls.add(call)
    }
    return ok(facts.signingCalls.has(call) ? "contests" : "refused")
  }

/**
 * NUT-09 over the block of each attempt of the operation, at its own keyset
 * (cashu/0029): the outputs the mint signed there for the operation. The
 * proofs may already be stored or spent, which the caller filters. Each
 * block is read once, however many devices' rows name it; a refused one is
 * skipped.
 *
 * The mint signs a slot once, so a block another operation shares holds the
 * outputs of whichever call won it:
 *
 * - shared with closed operations only, it keeps the outputs no one stored:
 *   a closed operation stored whatever it signed;
 * - outputs stored already, in slots no other operation's block names, are
 *   still this operation's, as in a block no one shares: another device's
 *   restore of the keyset stored them with no booking (cashu/0038);
 * - where an open operation's block shares signed slots no one stored, that
 *   operation is judged (`judgeSharingOperation`): its block's first slot is
 *   restored, and while it is unsigned the operation signed none of them
 *   (cashu/0029). Once it is signed, the mint is asked whether its call
 *   could have signed them; one that could not is refused there for good,
 *   no call of its can sign there any more.
 *   Ones that could contest those outputs: `CashuReclaimAmbiguous`, or with
 *   `settleContest` (past the grace) they are stored with no booking
 *   (`contested`), and each block is refused whose operation has nothing
 *   else left in it and no call that can still sign there.
 *
 * `final` says the operation's call can no longer sign anything, learned
 * before this restore: its token spent, its quote `ISSUED`. Its blocks that
 * hold no signature are then refused for good.
 *
 * The marks it learned are written before it returns, an ambiguous block
 * included. The blocks are asked for at once.
 */
/** The slots `attempt`'s block shares with `other`'s, in `attempt`'s keyset. */
const overlapOf = (
  attempt: CashuBlock,
  other: { readonly counter: number; readonly slots: number }
): CashuBlock => {
  const from = Math.max(attempt.counter, other.counter)
  return {
    keysetId: attempt.keysetId,
    counter: from,
    slots:
      Math.min(attempt.counter + attempt.slots, other.counter + other.slots) -
      from,
  }
}

export const restoreCashuAttempts =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    attempts: ReadonlyArray<CashuAttempt>,
    {
      final = false,
      settleContest = false,
    }: { readonly final?: boolean; readonly settleContest?: boolean } = {}
  ): Task<
    {
      readonly found: boolean
      readonly proofs: ReadonlyArray<Proof>
      /** A block was contested and given to no one. */
      readonly contested: boolean
    },
    MintFailure | CashuReclaimAmbiguousError,
    CashuWalletDep & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const candidates = [
      ...new Map(
        attempts
          .filter((attempt) => !attempt.rejected)
          .map((attempt) => [blockKeyOf(attempt), attempt])
      ).values(),
    ]
    const restore = (block: CashuBlock) => restoreBlock(loaded, block)
    // Attempts any device made, maybe in a keyset this wallet has not
    // loaded yet (cashu/0035).
    const operable = await ensureCashuKeysets(
      loaded,
      candidates.map((attempt) => attempt.keysetId)
    )
    if (!operable.ok) return operable
    const restored = await Promise.all(
      candidates.map(async (attempt) => ({
        attempt,
        signed: await restore(attempt),
      }))
    )

    // What this run learned, written together: blocks refused per
    // operation, the outputs of a contest given to no one, and the blocks of
    // every side of that contest (cashu/0029).
    const refused = new Map<CashuOperationId, Array<CashuBlock>>()
    const contestedBlocks = new Map<CashuOperationId, Array<CashuBlock>>()
    const note = (
      marks: Map<CashuOperationId, Array<CashuBlock>>,
      id: CashuOperationId,
      block: CashuBlock
    ): void => {
      marks.set(id, [...(marks.get(id) ?? []), block])
    }
    const refuse = (id: CashuOperationId, block: CashuBlock): void =>
      note(refused, id, block)
    const unbooked: Proof[] = []
    const writeLearned = async (): Promise<void> => {
      const rowsToMark = async (
        marks: Map<CashuOperationId, Array<CashuBlock>>,
        mark: "isRejected" | "isContested"
      ) =>
        (
          await Promise.all(
            [...marks].map(([id, blocks]) =>
              unmarkedRowsOf(evolu, id, blocks, mark)
            )
          )
        ).flat()
      const rejectedIds = await rowsToMark(refused, "isRejected")
      const contestedIds = await rowsToMark(contestedBlocks, "isContested")
      const rows = toNewCashuProofs(run.deps, unbooked, loaded.mint)
      if (
        rejectedIds.length === 0 &&
        contestedIds.length === 0 &&
        rows.length === 0
      )
        return
      await runMutationWithCompletion((options) => {
        const mutationOptions = { ...options, owner: evoluOwner }

        // Their identity alone, with no booking (cashu/0024, 0029).
        upsertCashuProofIdentities(evolu, rows, mutationOptions)
        for (const id of rejectedIds)
          evolu.update(
            "cashuOperationAttempt",
            { id, isRejected: sqliteTrue },
            mutationOptions
          )
        for (const id of contestedIds)
          evolu.update(
            "cashuOperationAttempt",
            { id, isContested: sqliteTrue },
            mutationOptions
          )
      })
    }
    const fail = async <F>(failure: F): Promise<F> => {
      await writeLearned()
      return failure
    }
    const facts = createCashuMintFacts()
    const unstoredOf = async (
      signedProofs: ReadonlyArray<Proof>
    ): Promise<ReadonlyArray<Proof>> => {
      const stored = new Set<string>(
        (
          await evolu.loadQuery(
            storedCashuProofIdsQuery(
              signedProofs.map((proof) => cashuProofIdFor(proof.secret))
            )
          )
        ).map((row) => row.id)
      )
      return signedProofs.filter(
        (proof) => !stored.has(cashuProofIdFor(proof.secret))
      )
    }
    const proofs: Proof[] = []
    let contested = false
    for (const { attempt, signed } of restored) {
      if (!signed.ok) return fail(signed)
      if (signed.value.proofs.length === 0) {
        if (final) refuse(operationId, attempt)
        continue
      }
      const shared = await evolu.loadQuery(
        cashuOverlappingAttemptsQuery({
          operationId,
          keysetId: attempt.keysetId,
          from: attempt.counter,
          to: attempt.counter + attempt.slots,
        })
      )
      if (shared.length === 0) {
        proofs.push(...signed.value.proofs)
        continue
      }
      const unstored = await unstoredOf(signed.value.proofs)
      const unstoredIds = new Set(
        unstored.map((proof) => cashuProofIdFor(proof.secret))
      )
      // Outputs already stored, in slots no other operation's block names,
      // are this operation's as in a block no one shares: a restore stored
      // them with no booking, and only this operation could have signed
      // there (cashu/0038).
      const storedProofs = signed.value.proofs.filter(
        (proof) => !unstoredIds.has(cashuProofIdFor(proof.secret))
      )
      if (storedProofs.length > 0) {
        const sharedIds = new Set<string>()
        for (const other of shared) {
          const overlap = await restore(overlapOf(attempt, other))
          if (!overlap.ok) return fail(overlap)
          for (const proof of overlap.value.proofs)
            sharedIds.add(cashuProofIdFor(proof.secret))
        }
        proofs.push(
          ...storedProofs.filter(
            (proof) => !sharedIds.has(cashuProofIdFor(proof.secret))
          )
        )
      }
      if (unstored.length === 0) continue

      // The open operations whose blocks share slots holding outputs no one
      // stored, each judged on whether its call could have signed them. What
      // those that could have share is contested; the rest is this
      // operation's.
      const contesting: Array<(typeof shared)[number]> = []
      const contestedIds = new Set<string>()
      for (const other of shared) {
        if (!isOpenCashuOperation(other)) continue
        const block = { ...other, keysetId: attempt.keysetId }
        const overlap = await restore(overlapOf(attempt, other))
        if (!overlap.ok) return fail(overlap)
        const shares = overlap.value.proofs
          .map((proof) => cashuProofIdFor(proof.secret))
          .filter((id) => unstoredIds.has(id))
        if (shares.length === 0) continue
        const verdict = await run(
          judgeSharingOperation(loaded, facts, {
            operationId: other.operationId,
            kind: other.kind,
            role: other.role,
            block,
          })
        )
        if (!verdict.ok) return fail(verdict)
        if (verdict.value === "contests") {
          contesting.push(other)
          for (const id of shares) contestedIds.add(id)
        } else if (verdict.value === "refused") {
          refuse(other.operationId, block)
        }
      }
      proofs.push(
        ...unstored.filter(
          (proof) => !contestedIds.has(cashuProofIdFor(proof.secret))
        )
      )
      if (contesting.length === 0) continue
      if (!settleContest)
        return fail(
          err(
            createCashuReclaimAmbiguousError({ mint: loaded.mint, operationId })
          )
        )
      // Past the grace: the contested outputs are given to no one. The sats
      // go into the wallet with no booking (cashu/0029).
      const kept = await run(
        keepUnstoredUnspent(
          loaded,
          unstored.filter((proof) =>
            contestedIds.has(cashuProofIdFor(proof.secret))
          )
        )
      )
      if (!kept.ok) return fail(kept)
      unbooked.push(...kept.value)
      contested = true
      note(contestedBlocks, operationId, attempt)
      for (const other of contesting)
        note(contestedBlocks, other.operationId, {
          ...other,
          keysetId: attempt.keysetId,
        })
      // A block is refused only when nothing of its operation's is left in
      // it, now or later (ground 4): no output no one stored outside what was
      // given away, and no call that can still sign there.
      if (
        final &&
        unstored.every((proof) =>
          contestedIds.has(cashuProofIdFor(proof.secret))
        )
      )
        refuse(operationId, attempt)
      for (const other of contesting) {
        const block = { ...other, keysetId: attempt.keysetId }
        const closed = await isClosedToCalls(loaded, facts, block)
        if (!closed.ok) return fail(closed)
        if (!closed.value) continue
        const whole = await restore(block)
        if (!whole.ok) return fail(whole)
        const left = (await unstoredOf(whole.value.proofs)).filter(
          (proof) => !contestedIds.has(cashuProofIdFor(proof.secret))
        )
        if (left.length === 0) refuse(other.operationId, block)
      }
    }
    await writeLearned()
    // Blocks of one operation may overlap, a takeover's and the call it
    // took over: each output counts once.
    const unique = [
      ...new Map(proofs.map((proof) => [proof.secret, proof])).values(),
    ]
    return ok({ found: unique.length > 0, proofs: unique, contested })
  }

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
  const answer = readMintAnswer(error)
  const lastSigned =
    answer === "outputsSigned" || answer === "duplicateOutputs"
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
