import { err, ok, type Task } from "@evolu/common"
import { defineError } from "../error.ts"
import {
  CashuAmount,
  CashuBolt11Schema,
  CashuQuoteIdSchema,
  type MintUrl,
} from "../modules/cashu/cashu-types.ts"
import { type CashuMeltError, costOfMelt, meltCashu } from "./cashu-melt.ts"
import {
  type CashuTopupClaimError,
  type CashuTopupDeps,
  claimCashuTopup,
} from "./cashu-topup.ts"
import {
  callMint,
  loadCashuWallet,
  type MintFailure,
  MintRejected,
} from "./cashu-wallet.ts"

/**
 * Moving funds between mints, Linky's autoswap (`linkshu/docs/autoswap.md`,
 * cashu.md §7): a mint quote at the target, a melt at the source paying its
 * invoice, a claim at the target. It writes an `autoswap` operation (mint =
 * target, `sourceMint` = source) and a `melt` at the source. It runs only on
 * the merchant's explicit action; the Cashu job resumes an interrupted one
 * with the someone-else-first rules of the claim.
 */

const createNothingToMoveError = defineError("CashuNothingToMove")<{
  readonly mint: MintUrl
}>()
export type CashuNothingToMoveError = ReturnType<
  typeof createNothingToMoveError
>

export interface CashuMoveEstimate {
  readonly amount: number
  readonly lightningFeeReserve: number
  readonly inputFee: number
  /** The most that leaves the source; unused fee reserve comes back. */
  readonly totalFromSource: number
}

const availableAt = async (deps: CashuTopupDeps, mint: MintUrl) =>
  (await deps.cashuShardStore.loadProofs()).filter(
    (proof) =>
      proof.mint === mint && proof.state === "available" && proof.unit === "sat"
  )

/** A sweep starts at the balance less the source's input-fee allowance. */
const sweepAmount =
  (
    sourceMint: MintUrl
  ): Task<number, MintFailure | CashuNothingToMoveError, CashuTopupDeps> =>
  async (run) => {
    const loaded = await run(loadCashuWallet(sourceMint))
    if (!loaded.ok) return loaded
    const proofs = await availableAt(run.deps, sourceMint)
    const total = proofs.reduce((sum, proof) => sum + proof.amount, 0)
    const allowance = Number(
      loaded.value.wallet.getFeesForProofs(
        proofs.map((proof) => ({ id: proof.keysetId }))
      )
    )
    const amount = total - allowance
    return amount > 0
      ? ok(amount)
      : err(createNothingToMoveError({ mint: sourceMint }))
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
    CashuTopupDeps
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
      await availableAt(run.deps, sourceMint)
    )
    return ok({
      amount: size.value,
      lightningFeeReserve: cost.feeReserve,
      inputFee: cost.inputFee,
      totalFromSource: cost.maxTotal,
    })
  }

export type CashuMoveError =
  | MintFailure
  | CashuNothingToMoveError
  | CashuMeltError
  | CashuTopupClaimError

/** A sweep retries this many times with smaller amounts, as Linky's. */
const SWEEP_RETRIES = 4

/** One attempt: quote at the target, record the autoswap, melt at the source. */
const moveOnce =
  ({
    sourceMint,
    targetMint,
    amount,
  }: {
    readonly sourceMint: MintUrl
    readonly targetMint: MintUrl
    readonly amount: number
  }): Task<{ readonly moved: number }, CashuMoveError, CashuTopupDeps> =>
  async (run) => {
    const store = run.deps.cashuShardStore
    const target = await run(loadCashuWallet(targetMint))
    if (!target.ok) return target
    const quote = await callMint(targetMint, () =>
      target.value.wallet.createMintQuoteBolt11(amount)
    )
    if (!quote.ok) return quote
    const quoteId = CashuQuoteIdSchema.safeParse(quote.value.quote)
    const invoice = CashuBolt11Schema.safeParse(quote.value.request)
    if (!quoteId.success || !invoice.success)
      return err(
        MintRejected({
          mint: targetMint,
          code: null,
          detail: "the target answered a quote without an invoice",
        })
      )
    // Persisted before the invoice can be paid.
    const operationId = await store.insertOperation({
      kind: "autoswap",
      status: "pending",
      mint: targetMint,
      unit: "sat",
      keysetId: target.value.keysetId,
      amount: CashuAmount(amount),
      feeReserve: null,
      inputsTotal: null,
      quoteId: quoteId.data,
      invoice: invoice.data,
      sourceMint,
      counter: null,
      locked: false,
      expiresAtSec:
        typeof quote.value.expiry === "number" && quote.value.expiry > 0
          ? quote.value.expiry
          : null,
      createdAtSec: Math.floor(run.deps.date.now().getTime() / 1000),
      tokenText: null,
      error: null,
    })

    const source = await run(loadCashuWallet(sourceMint))
    if (!source.ok) return source
    const meltQuote = await callMint(sourceMint, () =>
      source.value.wallet.createMeltQuoteBolt11(invoice.data)
    )
    if (!meltQuote.ok) return meltQuote
    const cost = costOfMelt(
      source.value,
      meltQuote.value,
      await availableAt(run.deps, sourceMint)
    )
    const melted = await run(
      meltCashu({
        mint: sourceMint,
        invoice: invoice.data,
        quoteId: meltQuote.value.quote,
        maxTotal: cost.maxTotal,
      })
    )
    if (!melted.ok) {
      // Only a melt that never left closes the autoswap; anything else may
      // still settle and is the job's to resume.
      if (
        melted.error.type === "CashuInsufficientFunds" ||
        melted.error.type === "CashuMeltUnpaid"
      )
        await store.updateOperation(operationId, {
          status: "failed",
          error: JSON.stringify(melted.error),
        })
      return melted
    }

    const claim = await run(claimCashuTopup(operationId))
    if (!claim.ok) return claim
    return ok({
      moved: claim.value.type === "claimed" ? claim.value.amount : amount,
    })
  }

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
  }): Task<{ readonly moved: number }, CashuMoveError, CashuTopupDeps> =>
  async (run) => {
    if (amount !== undefined)
      return await run(moveOnce({ sourceMint, targetMint, amount }))
    const start = await run(sweepAmount(sourceMint))
    if (!start.ok) return start
    let size = start.value
    let last: CashuMoveError | null = null
    for (let attempt = 0; attempt <= SWEEP_RETRIES && size > 0; attempt += 1) {
      const moved = await run(
        moveOnce({ sourceMint, targetMint, amount: size })
      )
      if (moved.ok || moved.error.type !== "CashuInsufficientFunds")
        return moved
      last = moved.error
      // Leave room for what the melt asked beyond the balance, and a bit more.
      const short = moved.error.needed - moved.error.available
      size -= Math.max(1, short, Math.ceil(size * 0.01))
    }
    return err(last ?? createNothingToMoveError({ mint: sourceMint }))
  }
