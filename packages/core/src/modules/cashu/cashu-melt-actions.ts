import type { MeltQuoteBolt11Response, Proof, ProofLike } from "@cashu/cashu-ts"
import {
  type ConsoleDep,
  err,
  type MutationOptions,
  ok,
  type Result,
  type Task,
} from "@evolu/common"
import {
  isMeltUnderWay,
  isMintRefusal,
  isRecoverableOutputCollision,
} from "../../cashu/cashu-mint-errors.ts"
import {
  amountToNumber,
  type CashuDeps,
  callMint,
  checkProofStates,
  classifyMintError,
  ensureCashuKeysets,
  type LoadedCashuWallet,
  loadCashuWallet,
  tryMint,
} from "../../cashu/cashu-wallet.ts"
import type { EvoluOwnerDep } from "../../deps.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import {
  CASHU_OUTPUT_BLOCK,
  type HeldCashuCounter,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  restoreCashuAttempts,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  type CashuMeltError,
  type CashuReclaimAmbiguousError,
  type CounterLockTimeoutError,
  createCashuInsufficientFundsError,
  createCashuMeltPendingError,
  createCashuMeltQuoteNotPayableError,
  createCashuMeltUnpaidError,
  createMintRejectedError,
  createMintUnreachableError,
  createQuoteExpiredError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  type CashuAttempt,
  CLAIMED_ELSEWHERE_GRACE_MS,
  latestCashuAttempt,
  loadCashuAttempts,
  loadCashuMelt,
} from "./cashu-guards.ts"
import {
  holdCashuProofs,
  keepUnstoredUnspent,
  type NewCashuProof,
  releaseCashuProofs,
  spendCashuProofs,
  sumCashuAmounts,
  toNewCashuProofs,
  toWalletProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
  upsertCashuProofIdentities,
} from "./cashu-proof-actions.ts"
import {
  availableCashuProofsAtMintQuery,
  heldCashuProofsOfOperationQuery,
  type StoredCashuProof,
  storedCashuProofIdsQuery,
} from "./cashu-queries.ts"
import {
  CashuAmount,
  CashuBolt11Schema,
  type CashuMeltPurpose,
  type CashuOperationId,
  type CashuProofId,
  CashuQuoteIdSchema,
  type KeysetId,
  type MintUrl,
} from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  cashuProofIdFor,
  encodeCashuError,
} from "./cashu-utils.ts"

/**
 * Paying a Lightning invoice from one mint's balance: price the quote, select
 * confirmed unspent sources, write the pending `melt` with its sources `held`
 * and the swap's counter reserved, swap exactly what the melt needs out of
 * them, store the swap's outputs with the melt's inputs `held`, then melt
 * with NUT-08 blank outputs for the change. A swap or melt whose response is
 * lost leaves the melt `pending`; resuming it recovers the swap's outputs
 * over the reserved slots (cashu/0019), fences a swap that may still arrive
 * (cashu/0019), and settles the one payment already sent, it is never a
 * retry (cashu/0027).
 */

export interface CashuMeltCost {
  readonly quoteId: string
  readonly amount: number
  /** The mint's Lightning fee reserve; unused reserve comes back as change. */
  readonly feeReserve: number
  /** NUT-02 input fees of the melt inputs and of the swap cutting them out. */
  readonly inputFee: number
  /** The most the balance can go down by. */
  readonly maxTotal: number
  readonly expiresAtSec: number | null
}

export interface CashuMeltReceipt {
  readonly operationId: CashuOperationId
  readonly quoteId: string
  readonly paidAmount: number
  readonly feeReserve: number
  readonly changeAmount: number
  /** What left the balance: invoice, Lightning fee and input fees. */
  readonly totalSpent: number
}

/**
 * What paying the quote costs at most when its pre-swap pays `swapFee` in
 * input fees. The pre-swap's `includeFees` adds the fee the melt pays to
 * spend its sent outputs, so the melt spends them at no cost: cashu-ts's own
 * split, never Payky's arithmetic.
 */
const meltCostOf = (
  loaded: LoadedCashuWallet,
  quote: MeltQuoteBolt11Response,
  swapFee: number
): CashuMeltCost => {
  const amount = amountToNumber(quote.amount)
  const feeReserve = amountToNumber(quote.fee_reserve)
  const meltInputFee = amountToNumber(
    loaded.wallet.getFeesToInclude(amount + feeReserve, {
      keysetId: loaded.keysetId,
    })
  )
  const inputFee = meltInputFee + swapFee
  return {
    quoteId: quote.quote,
    amount,
    feeReserve,
    inputFee,
    maxTotal: amount + feeReserve + inputFee,
    expiresAtSec:
      typeof quote.expiry === "number" && quote.expiry > 0
        ? quote.expiry
        : null,
  }
}

/**
 * What paying the quote costs at most from `available`, nothing changing
 * state: the pre-swap's input fee is that of the proofs cashu-ts selects
 * for it, as `prepareCashuMeltSwap` selects them, never of every proof the
 * mint holds. The proofs' keysets are made operable first: one synced in
 * from another device may name a keyset this wallet has not loaded
 * (cashu/0035). The selection may differ when the melt runs, which holds
 * the confirmed total once more against the proofs it selects then
 * (cashu/0023).
 */
export const costOfMelt = async (
  loaded: LoadedCashuWallet,
  quote: MeltQuoteBolt11Response,
  available: ReadonlyArray<StoredCashuProof>
): Promise<Result<CashuMeltCost, MintFailure>> => {
  const operable = await ensureCashuKeysets(
    loaded,
    available.map((proof) => proof.keysetId)
  )
  if (!operable.ok) return operable
  const sent = meltCostOf(loaded, quote, 0)
  const selected = (() => {
    try {
      return loaded.wallet.selectProofsToSend(
        toWalletProofs(available),
        sent.maxTotal,
        true
      ).send
    } catch {
      return []
    }
  })()
  return ok(
    meltCostOf(
      loaded,
      quote,
      selected.length === 0
        ? 0
        : amountToNumber(loaded.wallet.getFeesForProofs(selected))
    )
  )
}

/** A melt quote and what paying it can cost at most. Touches no proof. */
export const quoteCashuMelt =
  ({
    mint,
    invoice,
  }: {
    readonly mint: MintUrl
    readonly invoice: string
  }): Task<CashuMeltCost, MintFailure, CashuDeps> =>
  async (run) => {
    const loaded = await run(loadCashuWallet(mint))
    if (!loaded.ok) return loaded
    const quote = await callMint(mint, () =>
      loaded.value.wallet.createMeltQuoteBolt11(invoice)
    )
    if (!quote.ok) return quote
    return costOfMelt(
      loaded.value,
      quote.value,
      await run.deps.evolu.loadQuery(availableCashuProofsAtMintQuery(mint))
    )
  }

/**
 * What a melt's owner writes in the batch that settles the melt
 * (cashu/0014): a withdrawal's movement or failure, a move's topup closed.
 * Plain writers, built before the melt, so the batch waits on nothing.
 * `paid` loads what it needs from the receipt first, before the batch, and
 * hands back its writer.
 */
export interface CashuMeltSettlement {
  readonly paid?: (
    receipt: CashuMeltReceipt
  ) => Promise<(options: MutationOptions) => void>
  readonly closed?: (
    status: "unpaid" | "failed",
    options: MutationOptions
  ) => void
}

/**
 * The mint answered PAID: change in, inputs spent, the melt `paid` and its
 * owner's rows, one batch.
 *
 * `swapped` is a resume's NUT-07 and NUT-09 answer (cashu/0027): the held
 * proofs the mint reports unspent, which the melt never spent and lets go,
 * and the pre-swap's outputs no device stored yet. Neither left the balance,
 * so neither is booked as spent. Without it every held proof is the melt's
 * input, as right after the melt.
 */
const settlePaid = async (
  deps: EvoluDep & EvoluOwnerDep & ConsoleDep,
  loaded: LoadedCashuWallet,
  operation: {
    readonly id: CashuOperationId
    readonly quoteId: string
    readonly amount: number
  },
  feeReserve: number,
  inputsTotal: number,
  change: ReadonlyArray<Proof>,
  now: TimestampMs,
  settlement: CashuMeltSettlement | undefined,
  swapped: {
    readonly unspent: ReadonlySet<CashuProofId>
    readonly outputs: ReadonlyArray<NewCashuProof>
  } = { unspent: new Set(), outputs: [] }
): Promise<CashuMeltReceipt> => {
  const { evolu, evoluOwner } = deps
  const rows = toNewCashuProofs(deps, change, loaded.mint)
  const held = await evolu.loadQuery(
    heldCashuProofsOfOperationQuery(operation.id)
  )
  const released = held.filter((proof) => swapped.unspent.has(proof.id))
  const changeAmount = sumCashuAmounts(rows)
  const receipt: CashuMeltReceipt = {
    operationId: operation.id,
    quoteId: operation.quoteId,
    paidAmount: operation.amount,
    feeReserve,
    changeAmount,
    totalSpent:
      inputsTotal -
      changeAmount -
      sumCashuAmounts(released) -
      sumCashuAmounts(swapped.outputs),
  }
  const writePaid = await settlement?.paid?.(receipt)
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, owner: evoluOwner }

    upsertCashuProofIdentities(
      evolu,
      [...rows, ...swapped.outputs],
      mutationOptions
    )
    spendCashuProofs(
      evolu,
      held
        .filter((proof) => !swapped.unspent.has(proof.id))
        .map((proof) => proof.id),
      mutationOptions
    )
    releaseCashuProofs(
      evolu,
      released.map((proof) => proof.id),
      mutationOptions
    )
    updateCashuOperation(
      evolu,
      operation.id,
      { status: "paid", settledAt: now },
      mutationOptions
    )
    writePaid?.(mutationOptions)
  })
  return receipt
}

/**
 * Nothing was paid: the inputs back to the balance, the melt closed and its
 * owner's rows, one batch. `swapped` names the held sources a pre-swap spent
 * and the outputs recovered from it, written in the same batch.
 */
const settleUnpaid = async (
  { evolu, evoluOwner }: EvoluDep & EvoluOwnerDep,
  operationId: CashuOperationId,
  status: "unpaid" | "failed",
  error: string | null,
  settlement: CashuMeltSettlement | undefined,
  swapped: {
    readonly spent: ReadonlySet<CashuProofId>
    readonly outputs: ReadonlyArray<NewCashuProof>
  } = { spent: new Set(), outputs: [] }
): Promise<void> => {
  const held = await evolu.loadQuery(
    heldCashuProofsOfOperationQuery(operationId)
  )
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, owner: evoluOwner }

    upsertCashuProofIdentities(evolu, swapped.outputs, mutationOptions)
    spendCashuProofs(
      evolu,
      held
        .filter((proof) => swapped.spent.has(proof.id))
        .map((proof) => proof.id),
      mutationOptions
    )
    releaseCashuProofs(
      evolu,
      held
        .filter((proof) => !swapped.spent.has(proof.id))
        .map((proof) => proof.id),
      mutationOptions
    )
    updateCashuOperation(evolu, operationId, { status, error }, mutationOptions)
    settlement?.closed?.(status, mutationOptions)
  })
}

type CashuSwapPreview = Awaited<
  ReturnType<LoadedCashuWallet["wallet"]["prepareSwapToSend"]>
>

/**
 * A melt's pre-swap of `amount` out of `proofs`, prepared and not sent: its
 * sent outputs from `counter` and its kept ones right after them, so the
 * call takes one run of slots (cashu/0039). It is prepared once more to
 * learn how many slots the sent outputs take; preparing is deterministic and
 * asks the mint nothing. Throws as cashu-ts does.
 */
export const prepareCashuMeltSwap = async (
  wallet: LoadedCashuWallet["wallet"],
  {
    amount,
    proofs,
    keysetId,
    counter,
  }: {
    readonly amount: number
    readonly proofs: ReadonlyArray<ProofLike>
    readonly keysetId: KeysetId
    readonly counter: number
  }
): Promise<CashuSwapPreview> => {
  const prepareWithKeepAt = (keepCounter: number) =>
    wallet.prepareSwapToSend(
      amount,
      [...proofs],
      { includeFees: true, keysetId },
      {
        send: { type: "deterministic", counter },
        keep: { type: "deterministic", counter: keepCounter },
      }
    )
  const sized = await prepareWithKeepAt(counter + CASHU_OUTPUT_BLOCK)
  return prepareWithKeepAt(counter + (sized.sendOutputs?.length ?? 0))
}

/**
 * A swap at fresh slots the melt reserves before the mint is called
 * (cashu/0019), exactly those its prepared outputs take (cashu/0039),
 * `alsoWrite` folded into the first reservation's batch. A collision
 * prepares it again at the next free slots. Refused, it signed nothing at
 * its slots (cashu/0029).
 */
const swapAtFreshBlocks = async (
  loaded: LoadedCashuWallet,
  keysetId: KeysetId,
  heldCounter: HeldCashuCounter,
  operationId: CashuOperationId,
  prepare: (counter: number) => Promise<Result<CashuSwapPreview, unknown>>,
  {
    first,
    alsoWrite,
    fence = false,
  }: {
    /** The preview at the current slot, already made by the caller. */
    readonly first?: Result<CashuSwapPreview, unknown>
    readonly alsoWrite?: (options: MutationOptions) => void
    /** The swap is the melt's fence, not its pre-swap (cashu/0019). */
    readonly fence?: boolean
  } = {}
): Promise<
  Result<
    {
      readonly send: ReadonlyArray<Proof>
      readonly keep: ReadonlyArray<Proof>
    },
    MintFailure
  >
> => {
  const swap = async (index: number): ReturnType<typeof swapAtFreshBlocks> => {
    const counter = heldCounter.current()
    const preview =
      index === 0 && first !== undefined ? first : await prepare(counter)
    if (!preview.ok) return err(classifyMintError(loaded.mint, preview.error))
    const slots =
      (preview.value.sendOutputs?.length ?? 0) +
      (preview.value.keepOutputs?.length ?? 0)
    await heldCounter.reserve(operationId, counter, {
      slots,
      role: "meltSwap",
      fence,
      ...(index === 0 && alsoWrite !== undefined ? { alsoWrite } : {}),
    })
    const swapped = await tryMint(() =>
      loaded.wallet.completeSwap(preview.value)
    )
    if (swapped.ok) return swapped
    const failure = classifyMintError(loaded.mint, swapped.error)
    if (
      isRecoverableOutputCollision(swapped.error) ||
      isMintRefusal(swapped.error)
    )
      await heldCounter.reject(operationId, counter, "meltSwap")
    if (
      !isRecoverableOutputCollision(swapped.error) ||
      index + 1 >= MAX_COUNTER_ATTEMPTS
    )
      return err(failure)
    await recoverFromCollision(
      loaded,
      keysetId,
      heldCounter,
      counter,
      swapped.error,
      Math.max(1, slots)
    )
    return swap(index + 1)
  }
  return swap(0)
}

interface CashuProbedBlock {
  readonly block: CashuAttempt
  readonly signed: boolean
  readonly secrets: ReadonlySet<string>
}

/**
 * Whether a call open at `open` may spend outputs signed at `signed`: a
 * device reserves a block past every block on record (cashu/0031), and only
 * a block it restored gives it outputs to spend, so in one keyset a call
 * spends only outputs of blocks below its own. Counters of two keysets say
 * nothing about each other.
 */
const mayHaveSpent = (open: CashuAttempt, signed: CashuAttempt): boolean =>
  open.keysetId !== signed.keysetId || open.counter > signed.counter

/**
 * Whether a call signed each block, read from its first slot: a swap's
 * outputs start there and are signed all or none, so an unsigned first slot
 * is a call that may still sign (cashu/0019). A signed block comes with
 * every output in it, whoever's, so a proof can be told to be none of its
 * outputs.
 */
const probeSwapBlocks = async (
  loaded: LoadedCashuWallet,
  blocks: ReadonlyArray<CashuAttempt>
): Promise<Result<ReadonlyArray<CashuProbedBlock>, MintFailure>> => {
  const operable = await ensureCashuKeysets(
    loaded,
    blocks.map((block) => block.keysetId)
  )
  if (!operable.ok) return operable
  const restore = (block: CashuAttempt, slots: number) =>
    callMint(loaded.mint, () =>
      loaded.wallet.restore(block.counter, slots, { keysetId: block.keysetId })
    )
  const probed: Array<CashuProbedBlock> = []
  for (const block of blocks) {
    const first = await restore(block, 1)
    if (!first.ok) return first
    if (first.value.proofs.length === 0) {
      probed.push({ block, signed: false, secrets: new Set() })
      continue
    }
    const whole = await restore(block, block.slots)
    if (!whole.ok) return whole
    probed.push({
      block,
      signed: true,
      secrets: new Set(whole.value.proofs.map((proof) => proof.secret)),
    })
  }
  return ok(probed)
}

/**
 * What a melt's pre-swap did, from the mint (cashu/0019, cashu/0027): the
 * held proofs it reports spent and unspent (NUT-07), and the outputs of the
 * melt's swap blocks, the pre-swap's and any fence's (cashu/0019), whichever
 * device reserved them, that no device has stored and the mint reports
 * unspent (NUT-09). The blocks are restored whatever the held proofs say:
 * another device may have marked the sources spent, held them for its own
 * melt, or never seen the sender's later writes. A proof the mint does not
 * answer for is `MintUnreachable`.
 *
 * The blocks' first slots are read before anything else, so a swap that
 * signs later is never taken for one that signed nothing:
 *
 * - `swapOpen`: a live block's first slot is unsigned, so a swap of the
 *   melt's whose answer was lost may still reach the mint, whatever another
 *   operation signed in the rest of the block.
 * - `unaccounted`: a held proof, or an output the swaps signed, is spent at
 *   the mint, and no block signed by then holds outputs of a swap that could
 *   have spent it (a block never holds its own inputs). The swap that spent
 *   it is one whose attempt has not synced in, a fence another device made
 *   (cashu/0019): its outputs are restored once it has.
 */
const checkPreSwap =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    settleContest: boolean
  ): Task<
    {
      readonly spent: ReadonlySet<CashuProofId>
      readonly unspent: ReadonlySet<CashuProofId>
      readonly outputs: ReadonlyArray<NewCashuProof>
      /** Of `outputs`, those a swap still open may spend. */
      readonly outputsAtRisk: ReadonlyArray<NewCashuProof>
      /**
       * Of `outputs`, those the melt request may spend: the outputs of
       * blocks below its blanks', every one when no blanks' block is known.
       */
      readonly outputsRequested: ReadonlyArray<NewCashuProof>
      readonly swapOpen: boolean
      readonly unaccounted: boolean
    },
    MintFailure | CashuReclaimAmbiguousError,
    CashuDeps
  > =>
  async (run) => {
    const attempts = await run.ok(loadCashuAttempts(operationId))
    const swaps = attempts.filter(
      (attempt) => !attempt.rejected && attempt.role === "meltSwap"
    )
    const blanks = attempts.filter(
      (attempt) => !attempt.rejected && attempt.role === "meltChange"
    )
    const blocks = [
      ...new Map(
        swaps.map((swap) => [`${swap.keysetId}|${swap.counter}`, swap])
      ).values(),
    ]
    const probed = await probeSwapBlocks(loaded, blocks)
    if (!probed.ok) return probed
    const restored = await run(
      restoreCashuAttempts(loaded, operationId, swaps, { settleContest })
    )
    if (!restored.ok) return restored
    const held = await run.deps.evolu.loadQuery(
      heldCashuProofsOfOperationQuery(operationId)
    )
    const stored = new Set<CashuProofId>(
      (
        await run.deps.evolu.loadQuery(
          storedCashuProofIdsQuery(
            restored.value.proofs.map((proof) => cashuProofIdFor(proof.secret))
          )
        )
      ).map((row) => row.id)
    )
    const unstored = toNewCashuProofs(
      run.deps,
      restored.value.proofs.filter(
        (proof) => !stored.has(cashuProofIdFor(proof.secret))
      ),
      loaded.mint
    )
    const states = await checkProofStates(
      loaded,
      toWalletProofs([...held, ...unstored])
    )
    if (!states.ok) return states
    if (states.value.some((state) => state !== "spent" && state !== "unspent"))
      return err(
        createMintUnreachableError({
          mint: loaded.mint,
          detail: "the mint did not answer for every proof",
        })
      )
    const heldStates = states.value.slice(0, held.length)
    const outputStates = states.value.slice(held.length)
    const idsIn = (state: "spent" | "unspent"): ReadonlySet<CashuProofId> =>
      new Set(
        held
          .filter((_, index) => heldStates[index] === state)
          .map((proof) => proof.id)
      )
    const spentSecrets = [
      ...held.filter((_, index) => heldStates[index] === "spent"),
      ...unstored.filter((_, index) => outputStates[index] === "spent"),
    ].map((proof) => proof.secret)
    const outputs = unstored.filter(
      (_, index) => outputStates[index] === "unspent"
    )
    const open = probed.value.filter((probe) => !probe.signed)
    const spendableBy = (callers: ReadonlyArray<CashuAttempt>) =>
      outputs.filter((output) =>
        probed.value.some(
          (probe) =>
            probe.secrets.has(output.secret) &&
            callers.some((caller) => mayHaveSpent(caller, probe.block))
        )
      )
    return ok({
      spent: idsIn("spent"),
      unspent: idsIn("unspent"),
      outputs,
      outputsAtRisk: spendableBy(open.map((probe) => probe.block)),
      outputsRequested: blanks.length === 0 ? outputs : spendableBy(blanks),
      swapOpen: open.length > 0,
      unaccounted: spentSecrets.some(
        (secret) =>
          !probed.value.some(
            (block) => block.signed && !block.secrets.has(secret)
          )
      ),
    })
  }

/** A proof a fence swaps: held by the melt, or an output of its swaps. */
interface CashuFenceSource {
  readonly keysetId: KeysetId
  readonly amount: number
  readonly secret: string
  readonly c: string
}

/**
 * A melt's own swap of `sources` into outputs of its own, fee taken, at two
 * fresh blocks of the keyset the mint signs with now (cashu/0019): one the
 * mint rotated away would refuse it for good. Once the mint answers it, no
 * earlier swap of those sources can sign any more: either this one spent
 * them, or the mint refuses it because the earlier one did.
 *
 * Every source is an input, as a receive swaps a token: a send would select
 * the cheapest cover and hand back, unswapped, a source worth no more than
 * its fee, which the caller books spent (cashu/0019).
 */
const fenceSources = async (
  deps: ConsoleDep,
  loaded: LoadedCashuWallet,
  heldCounter: HeldCashuCounter,
  operationId: CashuOperationId,
  sources: ReadonlyArray<CashuFenceSource>
): Promise<Result<ReadonlyArray<NewCashuProof>, MintFailure>> => {
  const proofs = toWalletProofs(sources)
  const swapped = await swapAtFreshBlocks(
    loaded,
    loaded.keysetId,
    heldCounter,
    operationId,
    (counter) =>
      tryMint(() =>
        loaded.wallet.prepareSwapToReceive(
          proofs,
          { keysetId: loaded.keysetId },
          { type: "deterministic", counter }
        )
      ),
    { fence: true }
  )
  if (!swapped.ok) return swapped
  return ok(
    toNewCashuProofs(
      deps,
      [...swapped.value.send, ...swapped.value.keep],
      loaded.mint
    )
  )
}

/**
 * Runs a fence holding the counter of the keyset the mint signs with now,
 * which the melt's own counter lock may not be.
 */
type CashuFence = (
  sources: ReadonlyArray<CashuFenceSource>
) => Promise<
  Result<ReadonlyArray<NewCashuProof>, MintFailure | CounterLockTimeoutError>
>

/**
 * A melt the mint did not pay, its held proofs checked first (NUT-07): held
 * sources a pre-swap spent before its outputs were stored are marked spent,
 * and those outputs are restored (NUT-09) over the blocks reserved for the
 * melt's swaps, by whichever device sent them (cashu/0019, cashu/0027). The
 * blocks are restored whether or not the melt still holds a spent source:
 * another device may have marked the sources spent, or held them for its
 * own melt, before this one settles (cashu/0019).
 *
 * A swap whose answer was lost may still reach the mint (`swapOpen`), and
 * with `fenceHeld` a melt request may (cashu/0027): everything the melt
 * would let go, its unspent held proofs and the swaps' unstored outputs, is
 * fenced first, swapped into outputs of the melt's own, and comes back as
 * those (cashu/0019). A spend no block here accounts for leaves the melt
 * `pending` until the attempt of the swap that made it syncs in, and so does
 * a proof the mint does not answer for, a fence it does not answer, or a
 * block another open operation shares (cashu/0029). Before `unfencedUntilMs`
 * no device can have fenced the melt yet, so with none of its swaps open, one
 * that may still land, such a spend is another device's melt holding the
 * same proofs, and the melt settles with the proof spent (cashu/0019).
 *
 * Settled, it returns true.
 */
const settleUnsentMelt =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    status: "unpaid" | "failed",
    error: string | null,
    settlement: CashuMeltSettlement | undefined,
    fence: CashuFence,
    {
      settleContest = false,
      fenceHeld = false,
      unfencedUntilMs,
    }: {
      readonly settleContest?: boolean
      readonly fenceHeld?: boolean
      readonly unfencedUntilMs?: number
    } = {}
  ): Task<
    boolean,
    MintFailure | CashuReclaimAmbiguousError | CounterLockTimeoutError,
    CashuDeps
  > =>
  async (run) => {
    const swapped = await run(checkPreSwap(loaded, operationId, settleContest))
    if (!swapped.ok) return swapped
    const {
      spent,
      unspent,
      outputs,
      outputsAtRisk,
      outputsRequested,
      swapOpen,
      unaccounted,
    } = swapped.value
    if (
      unaccounted &&
      (swapOpen ||
        unfencedUntilMs === undefined ||
        run.deps.date.now().getTime() >= unfencedUntilMs)
    )
      return ok(false)
    const heldUnspent =
      swapOpen || fenceHeld
        ? (
            await run.deps.evolu.loadQuery(
              heldCashuProofsOfOperationQuery(operationId)
            )
          ).filter((proof) => unspent.has(proof.id))
        : []
    const fencedOutputs = fenceHeld
      ? [
          ...new Map(
            [...outputsAtRisk, ...outputsRequested].map((proof) => [
              proof.secret,
              proof,
            ])
          ).values(),
        ]
      : outputsAtRisk
    const sources: ReadonlyArray<CashuFenceSource> = [
      ...heldUnspent,
      ...fencedOutputs,
    ]
    const fenced = sources.length === 0 ? ok([]) : await fence(sources)
    if (!fenced.ok) return fenced
    const fencedSecrets = new Set(fencedOutputs.map((proof) => proof.secret))
    await settleUnpaid(run.deps, operationId, status, error, settlement, {
      spent: new Set([...spent, ...heldUnspent.map((proof) => proof.id)]),
      outputs: [
        ...outputs.filter((proof) => !fencedSecrets.has(proof.secret)),
        ...fenced.value,
      ],
    })
    return ok(true)
  }

export type CashuMeltResume =
  | { readonly type: "paid"; readonly receipt: CashuMeltReceipt }
  | { readonly type: "unpaid" }
  | { readonly type: "pending" }
  | { readonly type: "settled" }

/**
 * What the mint's UNPAID settles for a melt:
 *
 * - `final`: no request to pay it can reach the mint any more
 *   (cashu/0027). A melt quote that expired, plus a grace for a clock ahead
 *   of the mint's, is never paid. Before, the melt is final only when it
 *   never went out: this device sent it, holds its counter lock, and
 *   reserved no blanks' block, which a melt reserves before it calls the
 *   mint. A device that only fenced it took it over (`ownFence`).
 * - `fence`: its quote states no expiry, so nothing but its inputs spent
 *   ends a request still on its way. Once a grace has passed since the melt
 *   was first seen pending, by the judging device's clock or the sender's
 *   `createdAt`, whichever is earlier, they are swapped into outputs of the
 *   melt's own first (cashu/0027).
 * - `wait`: a request whose answer was lost may still be on its way, and a
 *   melt another device sent may be sent yet.
 */
type CashuUnpaidVerdict = "final" | "fence" | "wait"

const judgeUnpaid = (
  melt: { readonly expiresAt: number | null; readonly createdAt: string },
  attempts: ReadonlyArray<CashuAttempt>,
  keysetId: KeysetId,
  takeOver: boolean,
  pendingSinceMs: number,
  nowMs: number
): CashuUnpaidVerdict => {
  if (
    melt.expiresAt !== null &&
    nowMs > melt.expiresAt + CLAIMED_ELSEWHERE_GRACE_MS
  )
    return "final"
  if (
    !takeOver &&
    latestCashuAttempt(attempts, keysetId, "meltChange") === null
  )
    return "final"
  const since = Math.min(new Date(melt.createdAt).getTime(), pendingSinceMs)
  if (melt.expiresAt === null && nowMs > since + CLAIMED_ELSEWHERE_GRACE_MS)
    return "fence"
  return "wait"
}

/** `resumeCashuMelt` for a caller already holding the melt's counter lock. */
const resumeUnderLock =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    settlement: CashuMeltSettlement | undefined,
    fence: CashuFence,
    {
      takeOver = false,
      settleContest = false,
      pendingSinceMs,
    }: CashuMeltResumeOptions = {}
  ): Task<
    CashuMeltResume,
    MintFailure | CashuReclaimAmbiguousError | CounterLockTimeoutError,
    CashuDeps
  > =>
  async (run) => {
    const { date } = run.deps
    const melt = await run.ok(loadCashuMelt(operationId))
    if (melt === null || melt.status !== "pending")
      return ok({ type: "settled" })
    const keysetId = melt.keysetId ?? loaded.keysetId
    const attempts = await run.ok(loadCashuAttempts(operationId))
    const quote = await callMint(melt.mintUrl, () =>
      loaded.wallet.checkMeltQuoteBolt11(melt.quoteId)
    )
    if (!quote.ok) return quote
    if (quote.value.state === "UNPAID") {
      const nowMs = date.now().getTime()
      const verdict = judgeUnpaid(
        melt,
        attempts,
        keysetId,
        takeOver,
        pendingSinceMs ?? nowMs,
        nowMs
      )
      if (verdict === "wait") return ok({ type: "pending" })
      const settled = await run(
        settleUnsentMelt(
          loaded,
          operationId,
          "unpaid",
          null,
          settlement,
          fence,
          { settleContest, fenceHeld: verdict === "fence" }
        )
      )
      if (!settled.ok) return settled
      return ok({ type: settled.value ? "unpaid" : "pending" })
    }
    if (quote.value.state !== "PAID") return ok({ type: "pending" })
    // The change sits at the blanks' slots, whichever device sent them.
    const attempt = latestCashuAttempt(attempts, keysetId, "meltChange")
    const change: Result<
      ReadonlyArray<Proof>,
      MintFailure | CashuReclaimAmbiguousError
    > = attempt === null
      ? ok([])
      : await (async () => {
          const restored = await run(
            restoreCashuAttempts(loaded, operationId, [attempt], {
              settleContest,
            })
          )
          if (!restored.ok) return restored
          return run(keepUnstoredUnspent(loaded, restored.value.proofs))
        })()
    if (!change.ok) return change
    // The rows this device has may be the ones written before the
    // pre-swap, the sender's later batches never synced in: the mint says
    // which held proofs the melt spent and which outputs the swap kept
    // (cashu/0027).
    const swapped = await run(checkPreSwap(loaded, operationId, settleContest))
    if (!swapped.ok) return swapped
    return ok({
      type: "paid",
      receipt: await settlePaid(
        run.deps,
        loaded,
        { id: operationId, quoteId: melt.quoteId, amount: melt.amount },
        melt.feeReserve,
        melt.inputsTotal,
        change.value,
        TimestampMs(date.now().getTime()),
        settlement,
        swapped.value
      ),
    })
  }

export interface CashuMeltResumeOptions {
  /**
   * A melt another device sent (cashu/0027): settled only on an answer the
   * sender cannot change any more, never as one that never went out.
   */
  readonly takeOver?: boolean
  /**
   * Gives a block contested past the grace to no one (cashu/0029): its
   * outputs go into the wallet with no booking, and the melt settles
   * without them.
   */
  readonly settleContest?: boolean
  /**
   * When the caller first saw the melt pending, by its own clock: the grace
   * before a melt whose quote states no expiry is fenced counts from it, or
   * from the melt's `createdAt` when that is earlier (cashu/0027). Now when
   * not given.
   */
  readonly pendingSinceMs?: number
  /**
   * Leaves the melt `pending` while another call holds its counter lock: that
   * call is sending or settling it, and the caller has other work than to
   * wait for it, as the Cashu job does.
   */
  readonly skipIfBusy?: boolean
}

/**
 * A `pending` melt after a lost response or a crash, this device's own or
 * one another device sent and left (cashu/0027): PAID reclaims the change
 * over the recorded blank slot, UNPAID returns the inputs — and, when its
 * pre-swap spent the sources, recovers the swap's outputs (cashu/0019) —
 * once no request to pay it can reach the mint any more: its quote expired,
 * or, for a quote stating no expiry, its inputs were fenced (cashu/0027).
 * Anything else leaves it as it is. It settles the one payment already
 * sent; it never sends again (cashu/0027). It holds the melt's counter
 * lock, so it never settles a melt this device is still sending, and fences
 * at the keyset the mint signs with now, holding that one's lock too when
 * the mint has rotated since the melt.
 */
export const resumeCashuMelt =
  (
    operationId: CashuOperationId,
    settlement?: CashuMeltSettlement,
    options: CashuMeltResumeOptions = {}
  ): Task<
    CashuMeltResume,
    MintFailure | CashuReclaimAmbiguousError | CounterLockTimeoutError,
    CashuDeps
  > =>
  async (run) => {
    const melt = await run.ok(loadCashuMelt(operationId))
    if (melt === null || melt.status !== "pending")
      return ok({ type: "settled" })
    const loaded = await run(loadCashuWallet(melt.mintUrl))
    if (!loaded.ok) return loaded
    const meltKeysetId = melt.keysetId ?? loaded.value.keysetId
    return await run(
      withCashuCounter(
        loaded.value,
        meltKeysetId,
        (held) => {
          const fence: CashuFence = async (sources) =>
            meltKeysetId === loaded.value.keysetId
              ? fenceSources(run.deps, loaded.value, held, operationId, sources)
              : run(
                  withCashuCounter(
                    loaded.value,
                    loaded.value.keysetId,
                    (active) => async () =>
                      fenceSources(
                        run.deps,
                        loaded.value,
                        active,
                        operationId,
                        sources
                      )
                  )
                )
          return resumeUnderLock(
            loaded.value,
            operationId,
            settlement,
            fence,
            options
          )
        },
        options.skipIfBusy === true
          ? { ifBusy: () => ({ type: "pending" }) }
          : {}
      )
    )
  }

interface MeltRequest {
  readonly mint: MintUrl
  readonly quote: MeltQuoteBolt11Response
  readonly invoice: string
  readonly maxTotal: number
  readonly purpose: CashuMeltPurpose
  readonly settlement: CashuMeltSettlement | undefined
}

/**
 * Select, reserve, swap, persist, melt and settle, holding the counter lock.
 * The sources are chosen under the lock, so a second melt on this device
 * never works from a stale selection, and only the proofs that cover the
 * melt are held (cashu/0026).
 */
const meltUnderLock =
  (
    loaded: LoadedCashuWallet,
    request: MeltRequest,
    held: HeldCashuCounter
  ): Task<CashuMeltReceipt, CashuMeltError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    const { mint, quote, maxTotal } = request
    // Another device fences a melt only once it has been pending for the
    // grace, counted from no earlier than now (cashu/0019, cashu/0027).
    const unfencedUntilMs = date.now().getTime() + CLAIMED_ELSEWHERE_GRACE_MS
    const amount = amountToNumber(quote.amount)
    const feeReserve = amountToNumber(quote.fee_reserve)
    const quoteId = CashuQuoteIdSchema.safeParse(quote.quote)
    const invoice = CashuBolt11Schema.safeParse(request.invoice)
    if (!quoteId.success || !invoice.success)
      return err(
        createMintRejectedError({
          mint,
          code: null,
          detail: "malformed melt quote",
        })
      )
    const operationId = cashuMeltOperationIdFor(mint, quoteId.data)

    // A quote is melted once (cashu/0041): a melt already written for it was
    // sent, or may have been, and is only ever settled, by its resume.
    // Checked under the lock, so a second call on this device waits for the
    // first one's rows.
    const existing = await run.ok(loadCashuMelt(operationId))
    if (existing !== null)
      return err(
        existing.status === "pending"
          ? createCashuMeltPendingError({ mint, operationId })
          : existing.status === "paid"
            ? createCashuMeltQuoteNotPayableError({ mint, state: "PAID" })
            : createCashuMeltUnpaidError({ mint })
      )

    // NUT-07 select: spent proofs are marked spent and left out.
    const stored = await evolu.loadQuery(availableCashuProofsAtMintQuery(mint))
    const states = await checkProofStates(loaded, toWalletProofs(stored))
    if (!states.ok) return states
    const spent = stored.filter((_, index) => states.value[index] === "spent")
    if (spent.length > 0)
      await runMutationWithCompletion((options) =>
        spendCashuProofs(
          evolu,
          spent.map((proof) => proof.id),
          { ...options, owner: evoluOwner }
        )
      )
    const available = stored.filter(
      (_, index) => states.value[index] === "unspent"
    )
    const operable = await ensureCashuKeysets(
      loaded,
      available.map((proof) => proof.keysetId)
    )
    if (!operable.ok) return operable
    const availableTotal = sumCashuAmounts(available)
    const insufficient = (needed: number) =>
      err(
        createCashuInsufficientFundsError({
          mint,
          needed,
          available: availableTotal,
        })
      )

    // The swap that cuts exactly what the melt needs, fee included, out of
    // `from`. Nothing is sent: its inputs are the sources the melt holds
    // (cashu/0026).
    const prepareSwap = (
      counter: number,
      from: ReadonlyArray<StoredCashuProof>
    ) =>
      tryMint(() =>
        prepareCashuMeltSwap(loaded.wallet, {
          amount: amount + feeReserve,
          proofs: toWalletProofs(from),
          keysetId: loaded.keysetId,
          counter,
        })
      )
    const firstSwap = await prepareSwap(held.current(), available)
    if (!firstSwap.ok)
      return insufficient(meltCostOf(loaded, quote, 0).maxTotal)
    // The confirmed total, held against the proofs this swap selects
    // (cashu/0023).
    const cost = meltCostOf(loaded, quote, amountToNumber(firstSwap.value.fees))
    if (cost.maxTotal > maxTotal || availableTotal < cost.maxTotal)
      return insufficient(cost.maxTotal)
    const chosen = new Set(firstSwap.value.inputs.map((proof) => proof.secret))
    const sources = available.filter((proof) => chosen.has(proof.secret))

    // The pending melt, its sources held and the swap's slots reserved, in
    // one batch before the mint is called (cashu/0019): a swap whose outputs
    // are never stored is recovered from these slots. Until the swap cuts
    // the melt's inputs out, the sources are its inputs.
    const fence: CashuFence = (fenced) =>
      fenceSources(run.deps, loaded, held, operationId, fenced)
    const writeIntent = (options: MutationOptions): void => {
      upsertCashuOperationRow(
        evolu,
        {
          id: operationId,
          kind: "melt",
          status: "pending",
          mintUrl: mint,
          amount: CashuAmount(amount),
          keysetId: loaded.keysetId,
        },
        options
      )
      evolu.upsert(
        "cashuMelt",
        {
          id: operationId,
          quoteId: quoteId.data,
          lnInvoice: invoice.data,
          feeReserve: NonNegativeInteger(feeReserve),
          inputsTotal: NonNegativeInteger(sumCashuAmounts(sources)),
          purpose: request.purpose,
          expiresAt:
            cost.expiresAtSec === null
              ? null
              : TimestampMs(cost.expiresAtSec * 1000),
        },
        options
      )
      holdCashuProofs(
        evolu,
        sources.map((proof) => proof.id),
        operationId,
        options
      )
    }

    // Swap exactly what the melt needs, fee included.
    const swapped = await swapAtFreshBlocks(
      loaded,
      loaded.keysetId,
      held,
      operationId,
      (counter) => prepareSwap(counter, sources),
      { first: firstSwap, alsoWrite: writeIntent }
    )
    if (!swapped.ok) {
      // The swap may have spent the sources before its answer was lost, or
      // still be on its way: NUT-07 and NUT-09 tell, a fence ends it
      // (cashu/0019), else the melt stays pending for the job.
      const closed = await run(
        settleUnsentMelt(
          loaded,
          operationId,
          "failed",
          encodeCashuError(swapped.error),
          request.settlement,
          fence,
          { unfencedUntilMs }
        )
      )
      return err(
        closed.ok && closed.value
          ? swapped.error
          : createCashuMeltPendingError({ mint, operationId })
      )
    }
    const inputs = swapped.value.send
    const keep = swapped.value.keep

    // Persist before melting, one batch: the melt's inputs held, the
    // remainder available, the consumed sources spent. `keep` returns the
    // proofs cashu-ts left out as they were: those the melt never held are
    // not written again.
    const outputSecrets = new Set<string>(
      [...inputs, ...keep].map((proof) => proof.secret)
    )
    const consumed = sources.filter((proof) => !outputSecrets.has(proof.secret))
    const availableSecrets = new Set(available.map((proof) => proof.secret))
    const sourceSecrets = new Set(sources.map((proof) => proof.secret))
    // What the melt takes from the balance: the sources less what the swap
    // kept of them, so its inputs and the swap's input fee, as a resume
    // without this batch counts it (cashu/0027).
    const inputsTotal =
      sumCashuAmounts(sources) -
      sumCashuAmounts(
        keep.filter(
          (proof) =>
            sourceSecrets.has(proof.secret) ||
            !availableSecrets.has(proof.secret)
        )
      )
    const keptSecrets = new Set(keep.map((proof) => proof.secret))
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

      evolu.update(
        "cashuMelt",
        { id: operationId, inputsTotal: NonNegativeInteger(inputsTotal) },
        mutationOptions
      )
      const inputRows = toNewCashuProofs(run.deps, inputs, mint)
      upsertCashuProofIdentities(evolu, inputRows, mutationOptions)
      holdCashuProofs(
        evolu,
        inputRows.map((proof) => proof.id),
        operationId,
        mutationOptions
      )
      upsertCashuProofIdentities(
        evolu,
        toNewCashuProofs(
          run.deps,
          keep.filter((proof) => !availableSecrets.has(proof.secret)),
          mint
        ),
        mutationOptions
      )
      // A source cashu-ts kept unchanged is this melt's to let go.
      releaseCashuProofs(
        evolu,
        sources
          .filter((proof) => keptSecrets.has(proof.secret))
          .map((proof) => proof.id),
        mutationOptions
      )
      spendCashuProofs(
        evolu,
        consumed.map((proof) => proof.id),
        mutationOptions
      )
    })

    // Melt with NUT-08 blanks at reserved slots: the request is prepared,
    // and its slots go on record before it is sent, also when it asks for
    // no change, so every device knows it may have gone out (cashu/0027,
    // cashu/0039).
    const counter = held.current()
    const prepared = await tryMint(() =>
      loaded.wallet.prepareMelt(
        "bolt11",
        quote,
        [...inputs],
        { keysetId: loaded.keysetId },
        { type: "deterministic", counter }
      )
    )
    if (!prepared.ok) {
      // Nothing was sent: the inputs come back as the swap left them.
      await settleUnpaid(
        run.deps,
        operationId,
        "failed",
        encodeCashuError(classifyMintError(mint, prepared.error)),
        request.settlement
      )
      return err(classifyMintError(mint, prepared.error))
    }
    await held.reserve(operationId, counter, {
      slots: prepared.value.outputData.length,
      role: "meltChange",
    })
    const melted = await tryMint(() =>
      loaded.wallet.completeMelt(prepared.value)
    )

    // Settle by the mint's answer.
    if (melted.ok && melted.value.quote.state === "PAID")
      return ok(
        await settlePaid(
          run.deps,
          loaded,
          { id: operationId, quoteId: quoteId.data, amount },
          feeReserve,
          inputsTotal,
          melted.value.change,
          TimestampMs(date.now().getTime()),
          request.settlement
        )
      )
    if (melted.ok && melted.value.quote.state === "UNPAID") {
      await settleUnpaid(
        run.deps,
        operationId,
        "unpaid",
        null,
        request.settlement
      )
      return err(createCashuMeltUnpaidError({ mint }))
    }
    if (!melted.ok) {
      const failure = classifyMintError(mint, melted.error)
      // Only the mint's own refusal says nothing was paid (cashu/0029); an
      // answer that would not be read is asked again, as a lost one is, and
      // so is a refusal saying the melt may be paying (cashu/0027).
      if (isMintRefusal(melted.error) && !isMeltUnderWay(melted.error)) {
        const heldInputs = await evolu.loadQuery(
          heldCashuProofsOfOperationQuery(operationId)
        )
        const states = await checkProofStates(
          loaded,
          toWalletProofs(heldInputs)
        )
        // An input the mint holds pending is being spent by a copy of this
        // request, whatever the refusal said (cashu/0027).
        if (!states.ok || !states.value.includes("pending")) {
          await held.reject(operationId, counter, "meltChange")
          // Inputs another device's fence spent first (cashu/0027) are not
          // let go as available; unasked, they come back as before.
          await settleUnpaid(
            run.deps,
            operationId,
            "failed",
            encodeCashuError(failure),
            request.settlement,
            {
              spent: new Set(
                states.ok
                  ? heldInputs
                      .filter((_, index) => states.value[index] === "spent")
                      .map((proof) => proof.id)
                  : []
              ),
              outputs: [],
            }
          )
          return err(failure)
        }
      }
      // A lost response: ask once, else it stays pending for the job.
      const resumed = await run(
        resumeUnderLock(loaded, operationId, request.settlement, fence)
      )
      if (resumed.ok && resumed.value.type === "paid")
        return ok(resumed.value.receipt)
      if (resumed.ok && resumed.value.type === "unpaid")
        return err(createCashuMeltUnpaidError({ mint }))
    }
    return err(createCashuMeltPendingError({ mint, operationId }))
  }

/**
 * Pays the quoted invoice from `mint`, never above `maxTotal` (the total the
 * merchant confirmed).
 */
export const meltCashu =
  ({
    mint,
    invoice,
    quoteId,
    maxTotal,
    purpose,
    settlement,
  }: {
    readonly mint: MintUrl
    readonly invoice: string
    readonly quoteId: string
    readonly maxTotal: number
    readonly purpose: CashuMeltPurpose
    /** The owner's rows, written in the batch that settles the melt. */
    readonly settlement?: CashuMeltSettlement
  }): Task<CashuMeltReceipt, CashuMeltError, CashuDeps> =>
  async (run) => {
    const { date } = run.deps
    // Its outputs derive in the keyset the mint signs with now: a snapshot
    // an earlier session kept may bind one the mint retired, and a refused
    // pre-swap closes the melt (cashu/0040).
    const loadedResult = await run(
      loadCashuWallet(mint, { keysets: "session" })
    )
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value

    // The quote must be UNPAID and not expired.
    const quote = await callMint(mint, () =>
      loaded.wallet.checkMeltQuoteBolt11(quoteId)
    )
    if (!quote.ok) return quote
    if (quote.value.state !== "UNPAID")
      return err(
        createCashuMeltQuoteNotPayableError({ mint, state: quote.value.state })
      )
    const nowSec = Math.floor(date.now().getTime() / 1000)
    if (quote.value.expiry > 0 && nowSec > quote.value.expiry)
      return err(createQuoteExpiredError({ mint, quoteId }))

    return await run(
      withCashuCounter(loaded, loaded.keysetId, (held) =>
        meltUnderLock(
          loaded,
          { mint, quote: quote.value, invoice, maxTotal, purpose, settlement },
          held
        )
      )
    )
  }
