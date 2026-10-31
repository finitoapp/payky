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
  isMintRefusal,
  isRecoverableOutputCollision,
  readMintAnswer,
} from "../../cashu/cashu-mint-errors.ts"
import {
  type CashuDeps,
  callMint,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
  tryMint,
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
  type HeldCashuCounter,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  restoreCashuAttempts,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  type CashuReclaimAmbiguousError,
  type CashuTopupClaimError,
  createMintRejectedError,
  createQuoteExpiredError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  CLAIMED_ELSEWHERE_GRACE_MS,
  isClaimedElsewhere,
  latestOtherAttempt,
  latestOwnAttempt,
  loadCashuAttempts,
  loadCashuTopup,
} from "./cashu-guards.ts"
import {
  keepUnstoredUnspent,
  type NewCashuProof,
  sumCashuAmounts,
  toNewCashuProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
  upsertCashuProofIdentities,
} from "./cashu-proof-actions.ts"
import type { CashuTopupRow } from "./cashu-queries.ts"
import {
  type CashuAmount,
  type CashuBolt11,
  CashuBolt11Schema,
  type CashuOperationAttemptId,
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
 * claimed the quote (cashu/0029). On detection nothing is written, and never
 * `failed`. Every claim's slots are on record as an attempt, so whichever
 * device's mint call succeeded, any device reclaims its proofs (cashu/0029).
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

/** The pending `topup` and its detail; a claim records its slots as attempts. */
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
 * - `expired`: the mint confirmed UNPAID past the quote's expiry and a grace
 *   for a clock ahead of the mint's; closed `failed`.
 * - `claimedElsewhere`: another device claims it; wait for its rows to sync.
 *   `attemptId` is that device's latest attempt, for the takeover.
 * - `contested`: a contest gave its outputs to no one: they are in the
 *   wallet with no booking, and the topup is closed (cashu/0029).
 */
export type CashuTopupClaim =
  | { readonly type: "claimed"; readonly amount: number }
  | { readonly type: "done" }
  | { readonly type: "unpaid" }
  | { readonly type: "expired" }
  | {
      readonly type: "claimedElsewhere"
      readonly attemptId: CashuOperationAttemptId | null
    }
  | { readonly type: "contested" }

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

      upsertCashuProofIdentities(evolu, proofs, mutationOptions)
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
 * A topup whose outputs a contest gave to no one (cashu/0029): it completed,
 * its outputs are in the wallet already, and no booking is written, so its
 * payment stays unpaid for the merchant to settle (cashu/0029).
 */
const closeContestedCashuTopup =
  (operationId: CashuOperationId): Task<void, never, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    await runMutationWithCompletion((options) =>
      updateCashuOperation(
        evolu,
        operationId,
        { status: "done", settledAt: TimestampMs(date.now().getTime()) },
        { ...options, owner: evoluOwner }
      )
    )
    return ok(undefined)
  }

/**
 * NUT-09 over every attempt on record (cashu/0029): the proofs of a claim
 * whose response was lost, this device's or another's. Found ones not yet
 * stored go in and the topup closes `done`. Called only once the quote is
 * `ISSUED`, so its blocks holding nothing are refused for good;
 * `settleContest` gives a contested block to no one, past the grace.
 */
const reclaimCashuTopup =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    settleContest: boolean
  ): Task<
    { readonly found: boolean; readonly amount: number },
    MintFailure | CashuReclaimAmbiguousError,
    CashuDeps
  > =>
  async (run) => {
    const restored = await run(
      restoreCashuAttempts(
        loaded,
        operationId,
        await run.ok(loadCashuAttempts(operationId)),
        { final: true, settleContest }
      )
    )
    if (!restored.ok) return restored
    const kept = await run(keepUnstoredUnspent(loaded, restored.value.proofs))
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(run.deps, kept.value, loaded.mint)
    const { found } = restored.value
    if (found) await run.ok(settleCashuTopup(operationId, rows))
    return ok({ found, amount: sumCashuAmounts(rows) })
  }

/**
 * A topup another device closed as contested, while this device's own claim
 * had been signed at a block that device never saw (cashu/0029): the quote
 * is `ISSUED`, so this device's blocks holding nothing are refused for good,
 * and outputs found in them go in with the booking, which no device wrote
 * for a contested topup. Its status and `settledAt` stay as the close wrote
 * them (cashu/0022). Returns the amount stored.
 */
export const reclaimContestedCashuTopup =
  (
    operationId: CashuOperationId
  ): Task<number, MintFailure | CashuReclaimAmbiguousError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner, date } = run.deps
    const topup = await run.ok(loadCashuTopup(operationId))
    if (topup === null) return ok(0)
    const own = (await run.ok(loadCashuAttempts(operationId))).filter(
      (attempt) => attempt.own && !attempt.rejected && !attempt.contested
    )
    if (own.length === 0) return ok(0)
    const loaded = await run(loadCashuWallet(topup.mintUrl))
    if (!loaded.ok) return loaded
    const restored = await run(
      restoreCashuAttempts(loaded.value, operationId, own, { final: true })
    )
    if (!restored.ok) return restored
    const kept = await run(
      keepUnstoredUnspent(loaded.value, restored.value.proofs)
    )
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(run.deps, kept.value, loaded.value.mint)
    if (rows.length === 0) return ok(0)
    const booking = await run.ok(
      loadCashuBooking(operationId, TimestampMs(date.now().getTime()))
    )
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

      upsertCashuProofIdentities(evolu, rows, mutationOptions)
      if (booking !== null) upsertCashuBooking(evolu, booking, mutationOptions)
    })
    return ok(sumCashuAmounts(rows))
  }

/**
 * The topup's mint at `counter`, prepared and not sent: its outputs tell how
 * many slots the call takes (cashu/0039).
 */
const prepareMintAt = (
  loaded: LoadedCashuWallet,
  topup: CashuTopupRow,
  config: { readonly keysetId: KeysetId; readonly privkey?: string },
  counter: number
) =>
  tryMint(() =>
    loaded.wallet.prepareMint(
      "bolt11",
      topup.amount,
      { quote: topup.quoteId },
      config,
      { type: "deterministic", counter }
    )
  )

/** The claim's attempts under the counter lock. */
const claimUnderLock =
  (
    loaded: LoadedCashuWallet,
    topup: CashuTopupRow,
    keysetId: KeysetId,
    resumeCounter: number | null,
    settleContest: boolean,
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
        // A claim whose response was lost, whichever device's: reclaimed from
        // the attempts on record. One not on record yet is that device's to
        // finish.
        const reclaimed = await run(
          reclaimCashuTopup(loaded, topup.id, settleContest)
        )
        if (!reclaimed.ok) return reclaimed
        if (reclaimed.value.found)
          return ok({ type: "claimed", amount: reclaimed.value.amount })
        // Every block on record was restored after the quote read ISSUED,
        // so no call can sign in any of them any more: a contest that gave
        // outputs to no one closes it done, unbooked (cashu/0029). A claim
        // signed at a block not synced in yet is reclaimed by its own device
        // (`reclaimContestedCashuTopup`).
        const attempts = await run.ok(loadCashuAttempts(topup.id))
        if (attempts.some((row) => row.contested)) {
          await run.ok(closeContestedCashuTopup(topup.id))
          return ok({ type: "contested" })
        }
        const other = latestOtherAttempt(attempts)
        return ok({ type: "claimedElsewhere", attemptId: other?.id ?? null })
      }
      if (state === "UNPAID") {
        // Only the mint's own UNPAID past expiry closes it, and `failed` is
        // final for every device: the grace covers a clock ahead of the
        // mint's, so a quote the customer can still pay stays pending
        // (cashu/0029).
        if (
          topup.expiresAt !== null &&
          date.now().getTime() > topup.expiresAt + CLAIMED_ELSEWHERE_GRACE_MS
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

      // Prepare the call, then reserve exactly its slots before the mint is
      // called (cashu/0039). Slots reserved fresh by this run; resumed or
      // adopted ones may hold an earlier call's outputs (cashu/0029).
      const counter = resumeCounter ?? held.current()
      const fresh = resumeCounter === null
      const prepared = await prepareMintAt(loaded, topup, config, counter)
      if (!prepared.ok)
        return err(classifyMintError(loaded.mint, prepared.error))
      await held.reserve(topup.id, counter, {
        slots: prepared.value.outputData.length,
        role: "mint",
      })
      const minted: Result<ReadonlyArray<Proof>, unknown> = await tryMint(() =>
        loaded.wallet.completeMint(prepared.value)
      )
      if (minted.ok) {
        const rows = toNewCashuProofs(run.deps, minted.value, loaded.mint)
        await run.ok(settleCashuTopup(topup.id, rows))
        return ok({ type: "claimed", amount: sumCashuAmounts(rows) })
      }

      // Slots signed already move the counter on; the next attempt
      // re-checks the quote, so a quote another device issued meanwhile is
      // reclaimed from its attempt instead of minted again.
      const error = minted.error
      // Issued between the check and this call, by another device's claim:
      // an answer about the quote, not a refusal of the claim. This call
      // signed nothing; the next round reads the quote ISSUED (cashu/0032).
      if (readMintAnswer(error) === "quoteIssued") {
        if (fresh) await held.reject(topup.id, counter, "mint")
        return attempt(index + 1, null, error)
      }
      if (!isRecoverableOutputCollision(error)) {
        const failure = classifyMintError(loaded.mint, error)
        if (fresh && isMintRefusal(error))
          await held.reject(topup.id, counter, "mint")
        return err(failure)
      }
      if (fresh) await held.reject(topup.id, counter, "mint")
      await recoverFromCollision(loaded, keysetId, held, counter, error)
      return attempt(index + 1, null, error)
    }

    return attempt(0, resumeCounter, null)
  }

/**
 * The claim of one pending topup: re-read the operation, re-check the quote,
 * reserve a counter and write it to the operation, mint, then the proofs,
 * `done` and the booking in one batch.
 *
 * `takeOver` is another device's attempt whose grace is over (cashu/0029).
 * While it is still that device's latest, this device adopts it as its own:
 * an `ISSUED` quote is reclaimed through NUT-09, and a quote still `PAID` is
 * minted at its slots. The seed is the account's, so those are the very
 * outputs the other device derived: the mint issues the quote once, to
 * whichever device asks first, and NUT-09 recovers the proofs on either
 * device. A newer attempt of that device's is waited for again.
 * `settleContest` gives a block contested past the grace to no one
 * (cashu/0029).
 */
export const claimCashuTopup =
  (
    operationId: CashuOperationId,
    {
      takeOver,
      settleContest = false,
    }: {
      readonly takeOver?: CashuOperationAttemptId
      readonly settleContest?: boolean
    } = {}
  ): Task<CashuTopupClaim, CashuTopupClaimError, CashuDeps> =>
  async (run) => {
    const topup = await run.ok(loadCashuTopup(operationId))
    if (topup === null || topup.status === "done") return ok({ type: "done" })
    if (topup.status !== "pending") return ok({ type: "expired" })
    const attempts = await run.ok(loadCashuAttempts(operationId))
    const other = latestOtherAttempt(attempts)
    const adopted =
      takeOver !== undefined && other?.id === takeOver ? other : null
    if (adopted === null && isClaimedElsewhere(attempts))
      return ok({ type: "claimedElsewhere", attemptId: other?.id ?? null })

    const loaded = await run(loadCashuWallet(topup.mintUrl))
    if (!loaded.ok) return loaded
    // Minted in the keyset the mint signs with now, never the one the quote
    // was made under: a mint that rotated since refuses outputs in the old
    // one for good (12002). An attempt in an older keyset is not resumed: an
    // unissued quote signed nothing there, and an issued one is reclaimed at
    // every attempt's own keyset.
    const keysetId = loaded.value.keysetId
    const resume =
      adopted?.keysetId === keysetId
        ? adopted
        : latestOwnAttempt(attempts, keysetId)
    const claim = await run(
      withCashuCounter(loaded.value, keysetId, (held) =>
        claimUnderLock(
          loaded.value,
          topup,
          keysetId,
          resume?.counter ?? null,
          settleContest,
          held
        )
      )
    )
    return claim
  }
