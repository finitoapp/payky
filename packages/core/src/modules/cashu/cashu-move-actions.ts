import { err, ok, type Result, type Task } from "@evolu/common"
import {
  amountToNumber,
  type CashuDeps,
  callMint,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import {
  type CashuMoveError,
  type CashuNothingToMoveError,
  createCashuMeltUnpaidError,
  createCashuNothingToMoveError,
  createMintRejectedError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  type CashuMeltSettlement,
  costOfMelt,
  meltCashu,
} from "./cashu-melt-actions.ts"
import { sumCashuAmounts, updateCashuOperation } from "./cashu-proof-actions.ts"
import {
  cashuMoveByMeltQuery,
  cashuProofsAtMintQuery,
} from "./cashu-queries.ts"
import {
  claimCashuTopup,
  requestCashuTopupQuote,
  upsertCashuTopupRows,
} from "./cashu-topup-actions.ts"
import {
  CashuAmount,
  type CashuOperationId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "./cashu-types.ts"
import {
  cashuMeltOperationIdFor,
  cashuMoveIdFor,
  encodeCashuError,
} from "./cashu-utils.ts"

/**
 * Moving funds between mints (cashu/0016): a quote at the target, a melt at
 * the source paying its invoice, a claim at the target. `cashuMove` links
 * the melt and the topup; neither is income. It runs only on the merchant's
 * action; the Cashu job claims an interrupted move's topup.
 */

export interface CashuMoveEstimate {
  readonly amount: number
  readonly lightningFeeReserve: number
  readonly inputFee: number
  /** The most that leaves the source; unused fee reserve comes back. */
  readonly totalFromSource: number
}

/** A sweep starts at the balance less the source's input-fee allowance. */
const sweepAmount =
  (
    sourceMint: MintUrl
  ): Task<number, MintFailure | CashuNothingToMoveError, CashuDeps> =>
  async (run) => {
    const loaded = await run(loadCashuWallet(sourceMint))
    if (!loaded.ok) return loaded
    const proofs = await run.deps.evolu.loadQuery(
      cashuProofsAtMintQuery(sourceMint, "available")
    )
    const allowance = amountToNumber(
      loaded.value.wallet.getFeesForProofs(
        proofs.map((proof) => ({ id: proof.keysetId }))
      )
    )
    const amount = sumCashuAmounts(proofs) - allowance
    return amount > 0
      ? ok(amount)
      : err(createCashuNothingToMoveError({ mint: sourceMint }))
  }

/** Prices a move without paying anything; both quotes simply expire. */
export const estimateCashuMove =
  ({
    sourceMint,
    targetMint,
    amount,
  }: {
    readonly sourceMint: MintUrl
    readonly targetMint: MintUrl
    /** Omitted: sweep the whole source balance. */
    readonly amount?: number
  }): Task<
    CashuMoveEstimate,
    MintFailure | CashuNothingToMoveError,
    CashuDeps
  > =>
  async (run) => {
    const size =
      amount === undefined ? await run(sweepAmount(sourceMint)) : ok(amount)
    if (!size.ok) return size
    const [target, source] = await Promise.all([
      run(loadCashuWallet(targetMint)),
      run(loadCashuWallet(sourceMint)),
    ])
    if (!target.ok) return target
    if (!source.ok) return source
    const mintQuote = await callMint(targetMint, () =>
      target.value.wallet.createMintQuoteBolt11(size.value)
    )
    if (!mintQuote.ok) return mintQuote
    const meltQuote = await callMint(sourceMint, () =>
      source.value.wallet.createMeltQuoteBolt11(mintQuote.value.request)
    )
    if (!meltQuote.ok) return meltQuote
    const cost = costOfMelt(
      source.value,
      meltQuote.value,
      await run.deps.evolu.loadQuery(
        cashuProofsAtMintQuery(sourceMint, "available")
      )
    )
    return ok({
      amount: size.value,
      lightningFeeReserve: cost.feeReserve,
      inputFee: cost.inputFee,
      totalFromSource: cost.maxTotal,
    })
  }

/**
 * What a move writes in the batch that settles its melt (cashu/0014): a melt
 * the source mint did not pay closes the move's topup `failed`, since its
 * invoice will not be paid. Anything else may still settle and is the job's
 * to claim.
 */
const cashuMoveSettlement = (
  evolu: Evolu,
  topupOperationId: CashuOperationId,
  sourceMint: MintUrl
): CashuMeltSettlement => ({
  closed: (status, options) => {
    if (status === "unpaid")
      updateCashuOperation(
        evolu,
        topupOperationId,
        {
          status: "failed",
          error: encodeCashuError(
            createCashuMeltUnpaidError({ mint: sourceMint })
          ),
        },
        options
      )
  },
})

/**
 * The settlement of the move a melt pays for, for the Cashu job that resumes
 * the melt; null when the melt is not a move's.
 */
export const loadCashuMoveSettlement =
  (
    meltOperationId: CashuOperationId
  ): Task<CashuMeltSettlement | null, never, EvoluDep> =>
  async (run) => {
    const [move] = await run.deps.evolu.loadQuery(
      cashuMoveByMeltQuery(meltOperationId)
    )
    return ok(
      move === undefined
        ? null
        : cashuMoveSettlement(
            run.deps.evolu,
            move.topupOperationId,
            move.sourceMintUrl
          )
    )
  }

/**
 * One attempt: quote at the target and the source, record the topup and the
 * move in one batch, melt at the source, claim at the target.
 */
const moveOnce =
  ({
    sourceMint,
    targetMint,
    amount,
  }: {
    readonly sourceMint: MintUrl
    readonly targetMint: MintUrl
    readonly amount: number
  }): Task<{ readonly moved: number }, CashuMoveError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const topup = await run(
      requestCashuTopupQuote({ mint: targetMint, amount: CashuAmount(amount) })
    )
    if (!topup.ok) return topup
    const source = await run(loadCashuWallet(sourceMint))
    if (!source.ok) return source
    const meltQuote = await callMint(sourceMint, () =>
      source.value.wallet.createMeltQuoteBolt11(topup.value.invoice)
    )
    if (!meltQuote.ok) return meltQuote
    const parsedMeltQuoteId = CashuQuoteIdSchema.safeParse(
      meltQuote.value.quote
    )
    if (!parsedMeltQuoteId.success)
      return err(
        createMintRejectedError({
          mint: sourceMint,
          code: null,
          detail: "the source answered a quote without an id",
        })
      )
    const meltQuoteId = parsedMeltQuoteId.data
    // Persisted before the invoice can be paid.
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

      upsertCashuTopupRows(evolu, topup.value, "move", mutationOptions)
      evolu.upsert(
        "cashuMove",
        {
          id: cashuMoveIdFor(topup.value.operationId),
          sourceMintUrl: sourceMint,
          targetMintUrl: targetMint,
          meltOperationId: cashuMeltOperationIdFor(sourceMint, meltQuoteId),
          topupOperationId: topup.value.operationId,
        },
        mutationOptions
      )
    })

    const cost = costOfMelt(
      source.value,
      meltQuote.value,
      await evolu.loadQuery(cashuProofsAtMintQuery(sourceMint, "available"))
    )
    const melted = await run(
      meltCashu({
        mint: sourceMint,
        invoice: topup.value.invoice,
        quoteId: meltQuoteId,
        maxTotal: cost.maxTotal,
        purpose: "move",
        settlement: cashuMoveSettlement(
          evolu,
          topup.value.operationId,
          sourceMint
        ),
      })
    )
    if (!melted.ok) {
      // A melt that never existed closes the topup here; an unpaid one closed
      // it in its own batch, and anything else may still settle and is the
      // job's to claim.
      if (melted.error.type === "CashuInsufficientFunds")
        await runMutationWithCompletion((options) =>
          updateCashuOperation(
            evolu,
            topup.value.operationId,
            { status: "failed", error: encodeCashuError(melted.error) },
            { ...options, owner: evoluOwner }
          )
        )
      return melted
    }

    const claim = await run(claimCashuTopup(topup.value.operationId))
    if (!claim.ok) return claim
    return ok({
      moved: claim.value.type === "claimed" ? claim.value.amount : amount,
    })
  }

/** A sweep retries this many times with smaller amounts. */
const SWEEP_RETRIES = 4

/**
 * Moves `amount` sat, or sweeps the source when `amount` is omitted. A sweep
 * retries with up to four smaller amounts to leave room for the fees.
 */
export const moveCashuFunds =
  ({
    sourceMint,
    targetMint,
    amount,
  }: {
    readonly sourceMint: MintUrl
    readonly targetMint: MintUrl
    readonly amount?: number
  }): Task<{ readonly moved: number }, CashuMoveError, CashuDeps> =>
  async (run) => {
    if (amount !== undefined)
      return await run(moveOnce({ sourceMint, targetMint, amount }))
    const start = await run(sweepAmount(sourceMint))
    if (!start.ok) return start
    const sweep = async (
      attempt: number,
      size: number,
      last: CashuMoveError | null
    ): Promise<Result<{ readonly moved: number }, CashuMoveError>> => {
      if (attempt > SWEEP_RETRIES || size <= 0)
        return err(last ?? createCashuNothingToMoveError({ mint: sourceMint }))
      const moved = await run(
        moveOnce({ sourceMint, targetMint, amount: size })
      )
      if (moved.ok || moved.error.type !== "CashuInsufficientFunds")
        return moved
      // Leave room for what the melt asked beyond the balance, and a bit more.
      const short = moved.error.needed - moved.error.available
      return sweep(
        attempt + 1,
        size - Math.max(1, short, Math.ceil(size * 0.01)),
        moved.error
      )
    }
    return await sweep(0, start.value, null)
  }
