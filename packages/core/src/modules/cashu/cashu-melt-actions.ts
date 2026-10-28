import type { MeltQuoteBolt11Response, Proof } from "@cashu/cashu-ts"
import {
  err,
  type MutationOptions,
  ok,
  type Result,
  type Task,
} from "@evolu/common"
import {
  amountToNumber,
  type CashuDeps,
  callMint,
  checkProofStates,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { EvoluOwnerDep } from "../../deps.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import {
  CASHU_OUTPUT_BLOCK,
  type HeldCashuCounter,
  isRecoverableOutputCollision,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  type CashuMeltError,
  createCashuInsufficientFundsError,
  createCashuMeltPendingError,
  createCashuMeltQuoteNotPayableError,
  createCashuMeltUnpaidError,
  createMintRejectedError,
  createQuoteExpiredError,
  type MintFailure,
} from "./cashu-errors.ts"
import { loadCashuMelt, loadOwnCashuAttempt } from "./cashu-guards.ts"
import {
  keepUnstoredUnspent,
  setCashuProofStates,
  sumCashuAmounts,
  toNewCashuProofs,
  toWalletProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
  upsertCashuProofRows,
} from "./cashu-proof-actions.ts"
import {
  cashuProofsAtMintQuery,
  cashuProofsOfOperationQuery,
  type StoredCashuProof,
} from "./cashu-queries.ts"
import {
  CashuAmount,
  CashuBolt11Schema,
  type CashuMeltPurpose,
  type CashuOperationId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  encodeCashuError,
  proofCountOf,
} from "./cashu-utils.ts"

/**
 * Paying a Lightning invoice from one mint's balance: price the quote, select
 * confirmed unspent sources, swap exactly what the melt needs out of them,
 * persist the pending `melt` with its inputs `held` before anything is sent,
 * then melt with NUT-08 blank outputs for the change. A response lost after
 * sending leaves the melt `pending`; resuming it settles the one payment
 * already sent, it is never a retry (withdraw/0013).
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

const feeOf = (loaded: LoadedCashuWallet, count: number): number =>
  count === 0
    ? 0
    : amountToNumber(loaded.wallet.getFeesForKeyset(count, loaded.keysetId))

/** What paying the quote costs at most, from stored proofs; nothing changes state. */
export const costOfMelt = (
  loaded: LoadedCashuWallet,
  quote: MeltQuoteBolt11Response,
  available: ReadonlyArray<StoredCashuProof>
): CashuMeltCost => {
  const amount = amountToNumber(quote.amount)
  const feeReserve = amountToNumber(quote.fee_reserve)
  const meltInputFee = feeOf(loaded, proofCountOf(amount + feeReserve))
  const swapFee = amountToNumber(
    loaded.wallet.getFeesForProofs(toWalletProofs(available))
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
    return ok(
      costOfMelt(
        loaded.value,
        quote.value,
        await run.deps.evolu.loadQuery(
          cashuProofsAtMintQuery(mint, "available")
        )
      )
    )
  }

/**
 * What a melt's owner writes in the batch that settles the melt
 * (cashu/0014): a withdrawal's movement or failure, a move's topup closed.
 * Plain writers, built before the melt, so the batch waits on nothing.
 */
export interface CashuMeltSettlement {
  readonly paid?: (receipt: CashuMeltReceipt, options: MutationOptions) => void
  readonly closed?: (
    status: "unpaid" | "failed",
    options: MutationOptions
  ) => void
}

/**
 * The mint answered PAID: change in, inputs spent, the melt `paid` and its
 * owner's rows, one batch.
 */
const settlePaid = async (
  { evolu, evoluOwner }: EvoluDep & EvoluOwnerDep,
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
  settlement: CashuMeltSettlement | undefined
): Promise<CashuMeltReceipt> => {
  const rows = toNewCashuProofs(change, loaded.mint) ?? []
  const held = await evolu.loadQuery(
    cashuProofsOfOperationQuery(operation.id, "held")
  )
  const changeAmount = sumCashuAmounts(rows)
  const receipt: CashuMeltReceipt = {
    operationId: operation.id,
    quoteId: operation.quoteId,
    paidAmount: operation.amount,
    feeReserve,
    changeAmount,
    totalSpent: inputsTotal - changeAmount,
  }
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, owner: evoluOwner }

    upsertCashuProofRows(
      evolu,
      rows,
      { state: "available", operationId: null },
      mutationOptions
    )
    setCashuProofStates(
      evolu,
      held.map((proof) => proof.id),
      { state: "spent" },
      mutationOptions
    )
    updateCashuOperation(
      evolu,
      operation.id,
      { status: "paid", settledAt: now },
      mutationOptions
    )
    settlement?.paid?.(receipt, mutationOptions)
  })
  return receipt
}

/**
 * Nothing was paid: the inputs back to the balance, the melt closed and its
 * owner's rows, one batch.
 */
const settleUnpaid = async (
  { evolu, evoluOwner }: EvoluDep & EvoluOwnerDep,
  operationId: CashuOperationId,
  status: "unpaid" | "failed",
  error: string | null,
  settlement: CashuMeltSettlement | undefined
): Promise<void> => {
  const held = await evolu.loadQuery(
    cashuProofsOfOperationQuery(operationId, "held")
  )
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, owner: evoluOwner }

    setCashuProofStates(
      evolu,
      held.map((proof) => proof.id),
      { state: "available", operationId: null },
      mutationOptions
    )
    updateCashuOperation(evolu, operationId, { status, error }, mutationOptions)
    settlement?.closed?.(status, mutationOptions)
  })
}

export type CashuMeltResume =
  | { readonly type: "paid"; readonly receipt: CashuMeltReceipt }
  | { readonly type: "unpaid" }
  | { readonly type: "pending" }
  | { readonly type: "settled" }

/**
 * A `pending` melt after a lost response or a crash: PAID reclaims the
 * change over the recorded blank slot, UNPAID returns the inputs, anything
 * else leaves it as it is. It settles the one payment already sent; it never
 * sends again (withdraw/0013).
 */
export const resumeCashuMelt =
  (
    operationId: CashuOperationId,
    settlement?: CashuMeltSettlement
  ): Task<CashuMeltResume, MintFailure, CashuDeps> =>
  async (run) => {
    const { date } = run.deps
    const melt = await run.ok(loadCashuMelt(operationId))
    if (melt === null || melt.status !== "pending")
      return ok({ type: "settled" })
    const loaded = await run(loadCashuWallet(melt.mintUrl))
    if (!loaded.ok) return loaded
    const quote = await callMint(melt.mintUrl, () =>
      loaded.value.wallet.checkMeltQuoteBolt11(melt.quoteId)
    )
    if (!quote.ok) return quote
    if (quote.value.state === "UNPAID") {
      await settleUnpaid(run.deps, operationId, "unpaid", null, settlement)
      return ok({ type: "unpaid" })
    }
    if (quote.value.state !== "PAID") return ok({ type: "pending" })
    const counter =
      melt.counter ?? (await run.ok(loadOwnCashuAttempt(operationId)))
    const change: Result<ReadonlyArray<Proof>, MintFailure> = counter === null
      ? ok([])
      : await (async () => {
          const restored = await callMint(melt.mintUrl, () =>
            loaded.value.wallet.restore(counter, CASHU_OUTPUT_BLOCK, {
              keysetId: melt.keysetId ?? loaded.value.keysetId,
            })
          )
          if (!restored.ok) return restored
          return run(keepUnstoredUnspent(loaded.value, restored.value.proofs))
        })()
    if (!change.ok) return change
    return ok({
      type: "paid",
      receipt: await settlePaid(
        run.deps,
        loaded.value,
        { id: operationId, quoteId: melt.quoteId, amount: melt.amount },
        melt.feeReserve,
        melt.inputsTotal,
        change.value,
        TimestampMs(date.now().getTime()),
        settlement
      ),
    })
  }

interface MeltRequest {
  readonly mint: MintUrl
  readonly quote: MeltQuoteBolt11Response
  readonly invoice: string
  readonly sources: ReadonlyArray<StoredCashuProof>
  readonly purpose: CashuMeltPurpose
  readonly settlement: CashuMeltSettlement | undefined
}

/** Swap, persist, melt and settle, holding the counter lock. */
const meltUnderLock =
  (
    loaded: LoadedCashuWallet,
    request: MeltRequest,
    held: HeldCashuCounter
  ): Task<CashuMeltReceipt, CashuMeltError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    const { mint, quote, sources } = request
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

    // Swap exactly what the melt needs, fee included.
    const swap = async (
      index: number
    ): Promise<
      Result<
        {
          readonly send: ReadonlyArray<Proof>
          readonly keep: ReadonlyArray<Proof>
        },
        MintFailure
      >
    > => {
      const counter = held.current()
      await held.advanceTo(counter + 2 * CASHU_OUTPUT_BLOCK)
      const swapped = await loaded.wallet
        .send(
          amount + feeReserve,
          toWalletProofs(sources),
          { includeFees: true, keysetId: loaded.keysetId },
          {
            send: { type: "deterministic", counter },
            keep: {
              type: "deterministic",
              counter: counter + CASHU_OUTPUT_BLOCK,
            },
          }
        )
        .then(
          (value) => ok(value),
          (error: unknown) => err(error)
        )
      if (swapped.ok) return swapped
      if (
        !isRecoverableOutputCollision(swapped.error) ||
        index + 1 >= MAX_COUNTER_ATTEMPTS
      )
        return err(classifyMintError(mint, swapped.error))
      await recoverFromCollision(
        loaded,
        loaded.keysetId,
        held,
        counter,
        swapped.error,
        2 * CASHU_OUTPUT_BLOCK
      )
      return swap(index + 1)
    }
    const swapped = await swap(0)
    if (!swapped.ok) return swapped
    const inputs = swapped.value.send
    const keep = swapped.value.keep

    // Persist before melting, one batch: the melt, its inputs held, the
    // remainder available, the consumed sources spent.
    const operationId = cashuMeltOperationIdFor(mint, quoteId.data)
    const inputsTotal = sumCashuAmounts(inputs)
    const outputSecrets = new Set<string>(
      [...inputs, ...keep].map((proof) => proof.secret)
    )
    const consumed = sources.filter((proof) => !outputSecrets.has(proof.secret))
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

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
        mutationOptions
      )
      evolu.upsert(
        "cashuMelt",
        {
          id: operationId,
          quoteId: quoteId.data,
          lnInvoice: invoice.data,
          feeReserve: NonNegativeInteger(feeReserve),
          inputsTotal: NonNegativeInteger(inputsTotal),
          purpose: request.purpose,
        },
        mutationOptions
      )
      upsertCashuProofRows(
        evolu,
        toNewCashuProofs(inputs, mint) ?? [],
        { state: "held", operationId },
        mutationOptions
      )
      upsertCashuProofRows(
        evolu,
        toNewCashuProofs(keep, mint) ?? [],
        { state: "available", operationId: null },
        mutationOptions
      )
      setCashuProofStates(
        evolu,
        consumed.map((proof) => proof.id),
        { state: "spent" },
        mutationOptions
      )
    })

    // Melt with NUT-08 blanks at a reserved slot.
    const counter = held.current()
    await held.reserve(operationId, counter)
    const melted = await loaded.wallet
      .meltProofsBolt11(
        quote,
        [...inputs],
        { keysetId: loaded.keysetId },
        { type: "deterministic", counter }
      )
      .then(
        (value) => ok(value),
        (error: unknown) => err(error)
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
      if (failure.type === "MintRejected") {
        await settleUnpaid(
          run.deps,
          operationId,
          "failed",
          encodeCashuError(failure),
          request.settlement
        )
        return err(failure)
      }
      // A lost response: ask once, else it stays pending for the job.
      const resumed = await run(
        resumeCashuMelt(operationId, request.settlement)
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
    const { evolu, evoluOwner, date } = run.deps
    const loadedResult = await run(loadCashuWallet(mint))
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

    // NUT-07 select: spent sources are marked spent and left out.
    const stored = await evolu.loadQuery(
      cashuProofsAtMintQuery(mint, "available")
    )
    const states = await checkProofStates(loaded, toWalletProofs(stored))
    if (!states.ok) return states
    const spent = stored.filter((_, index) => states.value[index] === "spent")
    if (spent.length > 0)
      await runMutationWithCompletion((options) =>
        setCashuProofStates(
          evolu,
          spent.map((proof) => proof.id),
          { state: "spent" },
          { ...options, owner: evoluOwner }
        )
      )
    const sources = stored.filter(
      (_, index) => states.value[index] === "unspent"
    )
    const cost = costOfMelt(loaded, quote.value, sources)
    const sourcesTotal = sumCashuAmounts(sources)
    if (cost.maxTotal > maxTotal || sourcesTotal < cost.maxTotal)
      return err(
        createCashuInsufficientFundsError({
          mint,
          needed: cost.maxTotal,
          available: sourcesTotal,
        })
      )

    return await run(
      withCashuCounter(loaded, loaded.keysetId, (held) =>
        meltUnderLock(
          loaded,
          { mint, quote: quote.value, invoice, sources, purpose, settlement },
          held
        )
      )
    )
  }
