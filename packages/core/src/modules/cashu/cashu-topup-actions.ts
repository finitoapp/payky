import type { MintQuoteBolt11Response, Proof } from "@cashu/cashu-ts"
import {
  err,
  type MutationOptions,
  ok,
  type Result,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import {
  type CashuDeps,
  callMint,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { MasterKeyDep } from "../../deps.ts"
import type { Evolu } from "../../evolu/schema.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../shared/key-derivation.ts"
import { TimestampMs } from "../shared/schema.ts"
import {
  loadCashuBooking,
  upsertCashuBooking,
} from "./cashu-booking-actions.ts"
import {
  CASHU_OUTPUT_BLOCK,
  type HeldCashuCounter,
  isOutputsAlreadySignedError,
  isRecoverableOutputCollision,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  type CashuTopupClaimError,
  createMintRejectedError,
  createQuoteExpiredError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  isClaimedElsewhere,
  loadCashuTopup,
  loadOwnCashuAttempt,
} from "./cashu-guards.ts"
import {
  keepUnstoredUnspent,
  type NewCashuProof,
  sumCashuAmounts,
  toNewCashuProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
  upsertCashuProofRows,
} from "./cashu-proof-actions.ts"
import type { CashuTopupRow } from "./cashu-queries.ts"
import {
  type CashuAmount,
  type CashuBolt11,
  CashuBolt11Schema,
  type CashuOperationId,
  type CashuQuoteId,
  CashuQuoteIdSchema,
  type CashuTopupPurpose,
  type KeysetId,
  type MintUrl,
} from "./cashu-types.ts"
import { cashuTopupOperationIdFor, encodeCashuError } from "./cashu-utils.ts"

/**
 * Lightning into the wallet: a mint quote, its pending `topup`, and the claim
 * that turns a paid quote into proofs. A payment's topup is booked in the
 * batch that completes it (cashu/0014); a move's is not income.
 *
 * The claim stops instead of racing when another Payky device already
 * claimed the quote (cashu/0015). On detection nothing is written, and never
 * `failed`, which would overwrite that device's `done`.
 */

export interface CashuTopupQuote {
  readonly operationId: CashuOperationId
  readonly mint: MintUrl
  readonly keysetId: KeysetId
  readonly amount: CashuAmount
  readonly quoteId: CashuQuoteId
  readonly invoice: CashuBolt11
  /** The quote's expiry, or null when the mint sets none. */
  readonly expiresAt: TimestampMs | null
  readonly locked: boolean
}

/** The NUT-20 key: Payky's nostr key (R4). */
const lockingPrivateKey = (deps: MasterKeyDep): string =>
  bytesToHex(deriveNostrSecretKey(deps.masterKey))

/**
 * A mint quote, locked to the nostr key when the mint lists NUT-20. Writes
 * nothing: the caller folds `upsertCashuTopupRows` into its own batch.
 */
export const requestCashuTopupQuote =
  ({
    mint,
    amount,
    description,
  }: {
    readonly mint: MintUrl
    readonly amount: CashuAmount
    readonly description?: string
  }): Task<CashuTopupQuote, MintFailure, CashuDeps> =>
  async (run) => {
    const loaded = await run(loadCashuWallet(mint))
    if (!loaded.ok) return loaded
    const { wallet, keysetId } = loaded.value
    const locked = loaded.value.supports(20)
    const quote = await callMint(mint, async () => {
      if (!locked) return wallet.createMintQuoteBolt11(amount, description)
      const { getPubKeyFromPrivKey } = await import("@cashu/cashu-ts")
      const { hexToBytes } = await import("@noble/hashes/utils.js")
      return wallet.createLockedMintQuote(
        amount,
        bytesToHex(
          getPubKeyFromPrivKey(hexToBytes(lockingPrivateKey(run.deps)))
        ),
        description
      )
    })
    if (!quote.ok) return quote
    const invoice = CashuBolt11Schema.safeParse(quote.value.request)
    const quoteId = CashuQuoteIdSchema.safeParse(quote.value.quote)
    if (!invoice.success || !quoteId.success)
      return err(
        createMintRejectedError({
          mint,
          code: null,
          detail: "the mint answered a quote without an invoice",
        })
      )
    return ok({
      operationId: cashuTopupOperationIdFor(mint, quoteId.data),
      mint,
      keysetId,
      amount,
      quoteId: quoteId.data,
      invoice: invoice.data,
      expiresAt:
        typeof quote.value.expiry === "number" && quote.value.expiry > 0
          ? TimestampMs(quote.value.expiry * 1000)
          : null,
      locked,
    })
  }

/** The pending `topup` and its detail. `counter` stays unset until a claim. */
export const upsertCashuTopupRows = (
  evolu: Evolu,
  quote: CashuTopupQuote,
  purpose: CashuTopupPurpose,
  options?: MutationOptions
): void => {
  upsertCashuOperationRow(
    evolu,
    {
      id: quote.operationId,
      kind: "topup",
      status: "pending",
      mintUrl: quote.mint,
      amount: quote.amount,
      keysetId: quote.keysetId,
    },
    options
  )
  evolu.upsert(
    "cashuTopup",
    {
      id: quote.operationId,
      quoteId: quote.quoteId,
      lnInvoice: quote.invoice,
      expiresAt: quote.expiresAt,
      locked: quote.locked ? sqliteTrue : sqliteFalse,
      purpose,
    },
    options
  )
}

/** A quote and its pending topup, written before the invoice can be paid. */
export const createCashuTopupQuote =
  ({
    purpose,
    ...request
  }: {
    readonly mint: MintUrl
    readonly amount: CashuAmount
    readonly description?: string
    readonly purpose: CashuTopupPurpose
  }): Task<CashuTopupQuote, MintFailure, CashuDeps> =>
  async (run) => {
    const quote = await run(requestCashuTopupQuote(request))
    if (!quote.ok) return quote
    await runMutationWithCompletion((options) =>
      upsertCashuTopupRows(run.deps.evolu, quote.value, purpose, {
        ...options,
        owner: run.deps.evoluOwner,
      })
    )
    return quote
  }

/**
 * - `claimed`: this run minted the proofs, or reclaimed its own lost attempt.
 * - `done`: the operation is already settled, by whichever device.
 * - `unpaid`: nobody paid the invoice yet.
 * - `expired`: the mint confirmed UNPAID past the quote's expiry; closed `failed`.
 * - `claimedElsewhere`: another device claims it; wait for its rows to sync.
 */
export type CashuTopupClaim =
  | { readonly type: "claimed"; readonly amount: number }
  | { readonly type: "done" }
  | { readonly type: "unpaid" }
  | { readonly type: "expired" }
  | { readonly type: "claimedElsewhere"; readonly counter: number | null }

/**
 * Proofs in, the operation `done` and its booking (cashu/0014): one batch,
 * the money safe and booked from here.
 */
const settleCashuTopup =
  (
    operationId: CashuOperationId,
    proofs: ReadonlyArray<NewCashuProof>
  ): Task<void, never, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    const now = TimestampMs(date.now().getTime())
    const booking = await run.ok(loadCashuBooking(operationId, now))
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

      upsertCashuProofRows(
        evolu,
        proofs,
        { state: "available", operationId: null },
        mutationOptions
      )
      updateCashuOperation(
        evolu,
        operationId,
        { status: "done", settledAt: now },
        mutationOptions
      )
      if (booking !== null) upsertCashuBooking(evolu, booking, mutationOptions)
    })
    return ok(undefined)
  }

/**
 * NUT-09 over the 64 slots one claim derives at `counter`: the proofs of a
 * claim whose response was lost, this device's or another's. Found ones not
 * yet stored go in and the topup closes `done`.
 */
export const reclaimCashuTopup =
  (
    loaded: LoadedCashuWallet,
    topup: Pick<CashuTopupRow, "id" | "keysetId">,
    counter: number
  ): Task<
    { readonly found: boolean; readonly amount: number },
    MintFailure,
    CashuDeps
  > =>
  async (run) => {
    const restored = await callMint(loaded.mint, () =>
      loaded.wallet.restore(counter, CASHU_OUTPUT_BLOCK, {
        keysetId: topup.keysetId ?? loaded.keysetId,
      })
    )
    if (!restored.ok) return restored
    const kept = await run(keepUnstoredUnspent(loaded, restored.value.proofs))
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(kept.value, loaded.mint)
    if (rows === null)
      return err(
        createMintRejectedError({
          mint: loaded.mint,
          code: null,
          detail: "mint returned malformed proofs from the reclaim scan",
        })
      )
    const found = restored.value.proofs.length > 0
    if (found) await run.ok(settleCashuTopup(topup.id, rows))
    return ok({ found, amount: sumCashuAmounts(rows) })
  }

const mintAttempt = async (
  loaded: LoadedCashuWallet,
  topup: CashuTopupRow,
  config: { readonly keysetId: KeysetId; readonly privkey?: string },
  counter: number
): Promise<Result<ReadonlyArray<Proof>, unknown>> =>
  loaded.wallet
    .mintProofsBolt11(topup.amount, topup.quoteId, config, {
      type: "deterministic",
      counter,
    })
    .then(
      (proofs) => ok(proofs),
      (error: unknown) => err(error)
    )

/** The claim's attempts under the counter lock. */
const claimUnderLock =
  (
    loaded: LoadedCashuWallet,
    topup: CashuTopupRow,
    keysetId: KeysetId,
    ownCounter: number | null,
    held: HeldCashuCounter
  ): Task<CashuTopupClaim, CashuTopupClaimError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    const config = topup.locked
      ? { keysetId, privkey: lockingPrivateKey(run.deps) }
      : { keysetId }
    const checkQuote = () =>
      callMint(loaded.mint, () =>
        loaded.wallet.checkMintQuoteBolt11(topup.quoteId)
      )

    const attempt = async (
      index: number,
      resumeCounter: number | null,
      lastCollision: unknown
    ): Promise<Result<CashuTopupClaim, CashuTopupClaimError>> => {
      // Out of attempts: the advance is kept and the topup stays pending, so
      // the next run starts further on.
      if (index >= MAX_COUNTER_ATTEMPTS)
        return err(classifyMintError(loaded.mint, lastCollision))
      // Re-check the quote before each attempt.
      const quote = await checkQuote()
      if (!quote.ok) return quote
      const state = (quote.value as MintQuoteBolt11Response).state
      if (state === "ISSUED") {
        // This device's own attempt lost its response: reclaim it. Another
        // device's issue is that device's to finish.
        if (topup.counter !== null && topup.counter === ownCounter) {
          const reclaimed = await run(
            reclaimCashuTopup(loaded, topup, topup.counter)
          )
          if (!reclaimed.ok) return reclaimed
          if (reclaimed.value.found)
            return ok({ type: "claimed", amount: reclaimed.value.amount })
        }
        return ok({ type: "claimedElsewhere", counter: topup.counter })
      }
      if (state === "UNPAID") {
        // Only the mint's own UNPAID past expiry closes it.
        if (
          topup.expiresAt !== null &&
          date.now().getTime() > topup.expiresAt
        ) {
          await runMutationWithCompletion((options) =>
            updateCashuOperation(
              evolu,
              topup.id,
              {
                status: "failed",
                error: encodeCashuError(
                  createQuoteExpiredError({
                    mint: loaded.mint,
                    quoteId: topup.quoteId,
                  })
                ),
              },
              { ...options, owner: evoluOwner }
            )
          )
          return ok({ type: "expired" })
        }
        return ok({ type: "unpaid" })
      }

      // Reserve the counter before the outputs are derived.
      const counter = resumeCounter ?? held.current()
      await held.reserve(topup.id, counter)
      const minted = await mintAttempt(loaded, topup, config, counter)
      if (minted.ok) {
        const rows = toNewCashuProofs(minted.value, loaded.mint)
        if (rows === null)
          return err(
            createMintRejectedError({
              mint: loaded.mint,
              code: null,
              detail: "mint returned malformed proofs",
            })
          )
        await run.ok(settleCashuTopup(topup.id, rows))
        return ok({ type: "claimed", amount: sumCashuAmounts(rows) })
      }

      const error = minted.error
      if (!isRecoverableOutputCollision(error))
        return err(classifyMintError(loaded.mint, error))
      // The operation's own synced counter already signed: another device
      // claimed with it.
      if (
        resumeCounter !== null &&
        resumeCounter === topup.counter &&
        isOutputsAlreadySignedError(error)
      ) {
        const recheck = await checkQuote()
        if (
          recheck.ok &&
          (recheck.value as MintQuoteBolt11Response).state === "ISSUED"
        )
          return ok({ type: "claimedElsewhere", counter: resumeCounter })
      }
      await recoverFromCollision(loaded, keysetId, held, counter, error)
      return attempt(index + 1, null, error)
    }

    return attempt(0, topup.counter, null)
  }

/**
 * The claim of one pending topup: re-read the operation, re-check the quote,
 * reserve a counter and write it to the operation, mint, then the proofs,
 * `done` and the booking in one batch.
 */
export const claimCashuTopup =
  (
    operationId: CashuOperationId
  ): Task<CashuTopupClaim, CashuTopupClaimError, CashuDeps> =>
  async (run) => {
    const topup = await run.ok(loadCashuTopup(operationId))
    if (topup === null || topup.status === "done") return ok({ type: "done" })
    if (topup.status !== "pending") return ok({ type: "expired" })
    const ownCounter = await run.ok(loadOwnCashuAttempt(operationId))
    if (isClaimedElsewhere(topup, ownCounter))
      return ok({ type: "claimedElsewhere", counter: topup.counter })

    const loaded = await run(loadCashuWallet(topup.mintUrl))
    if (!loaded.ok) return loaded
    const keysetId = topup.keysetId ?? loaded.value.keysetId
    const claim = await run(
      withCashuCounter(loaded.value, keysetId, (held) =>
        claimUnderLock(loaded.value, topup, keysetId, ownCounter, held)
      )
    )
    return claim
  }
