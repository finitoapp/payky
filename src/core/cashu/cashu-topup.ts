import type { MintQuoteBolt11Response } from "@cashu/cashu-ts"
import { err, type LockManagerDep, ok, type Task } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"

import {
  CASHU_OUTPUT_BLOCK,
  counterScopeOf,
  isOutputsAlreadySignedError,
  isRecoverableOutputCollision,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  withCashuCounter,
} from "@/core/cashu/cashu-counters.ts"
import {
  keepUnstoredUnspent,
  toNewCashuProofs,
} from "@/core/cashu/cashu-restore.ts"
import type { CashuShardStoreDep } from "@/core/cashu/cashu-shard-store.ts"
import {
  type CashuWalletDep,
  type ClaimedElsewhereError,
  type CounterLockTimeoutError,
  callMint,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
  type MintFailure,
  MintRejected,
  QuoteExpired,
  type QuoteExpiredError,
} from "@/core/cashu/cashu-wallet.ts"
import type { DateDep, MasterKeyDep } from "@/core/deps.ts"
import {
  cashuClaimAttemptQuery,
  recordCashuClaimAttempt,
} from "@/core/evolu/device-cashu.ts"
import type { CashuOperationCopy } from "@/core/modules/cashu/cashu-queries.ts"
import {
  type CashuAmount,
  type CashuBolt11,
  CashuBolt11Schema,
  type CashuOperationId,
  type CashuQuoteId,
  CashuQuoteIdSchema,
  type MintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import type { DeviceEvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

/**
 * Lightning into the shared wallet: a mint quote, the pending `topup`
 * operation Linky reads (`linkshu/src/topup`), and the claim that turns a paid
 * quote into proofs (cashu.md §5 "Lightning").
 *
 * The claim stops instead of racing when another app or device already
 * claimed the quote (decision 11): Linky resumes every pending topup it
 * syncs, and its locks do not exclude Payky. On detection nothing is written,
 * and never `failed`, which would overwrite the winner's `done`.
 */

export type CashuTopupDeps = CashuWalletDep &
  CashuShardStoreDep &
  DeviceEvoluDep &
  LockManagerDep &
  MasterKeyDep &
  DateDep

export interface CashuTopupQuote {
  readonly operationId: CashuOperationId
  readonly mint: MintUrl
  readonly quoteId: CashuQuoteId
  readonly invoice: CashuBolt11
  /** The quote's expiry in seconds, or null when the mint sets none. */
  readonly expiresAtSec: number | null
}

const nowSeconds = (deps: DateDep): number =>
  Math.floor(deps.date.now().getTime() / 1000)

/** The NUT-20 key: Payky's nostr key, the same one Linky locks quotes to. */
const lockingPrivateKey = (deps: MasterKeyDep): string =>
  bytesToHex(deriveNostrSecretKey(deps.masterKey))

/**
 * Creates the quote (locked to the nostr key when the mint lists NUT-20) and
 * writes the pending `topup` with every field Linky decodes it by: without
 * `keysetId` Linky silently ignores it. `counter` stays unset until a claim.
 */
export const createCashuTopupQuote =
  ({
    mint,
    amount,
    description,
  }: {
    readonly mint: MintUrl
    readonly amount: CashuAmount
    readonly description?: string
  }): Task<CashuTopupQuote, MintFailure, CashuTopupDeps> =>
  async (run) => {
    const loadedResult = await run(loadCashuWallet(mint))
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value
    const locked = loaded.supports(20)

    const quoteResult = await callMint(mint, async () => {
      if (!locked)
        return loaded.wallet.createMintQuoteBolt11(amount, description)
      const { getPubKeyFromPrivKey } = await import("@cashu/cashu-ts")
      const { hexToBytes } = await import("@noble/hashes/utils.js")
      return loaded.wallet.createLockedMintQuote(
        amount,
        bytesToHex(
          getPubKeyFromPrivKey(hexToBytes(lockingPrivateKey(run.deps)))
        ),
        description
      )
    })
    if (!quoteResult.ok) return quoteResult
    const quote = quoteResult.value
    const invoice = CashuBolt11Schema.safeParse(quote.request)
    const quoteId = CashuQuoteIdSchema.safeParse(quote.quote)
    if (!invoice.success || !quoteId.success)
      return err(
        MintRejected({
          mint,
          code: null,
          detail: "the mint answered a quote without an invoice",
        })
      )
    const expiresAtSec =
      typeof quote.expiry === "number" && quote.expiry > 0 ? quote.expiry : null

    const operationId = await run.deps.cashuShardStore.insertOperation({
      kind: "topup",
      status: "pending",
      mint,
      unit: "sat",
      keysetId: loaded.keysetId,
      amount,
      feeReserve: null,
      inputsTotal: null,
      quoteId: quoteId.data,
      invoice: invoice.data,
      sourceMint: null,
      counter: null,
      locked,
      expiresAtSec,
      createdAtSec: nowSeconds(run.deps),
      tokenText: null,
      error: null,
    })

    return ok({
      operationId,
      mint,
      quoteId: quoteId.data,
      invoice: invoice.data,
      expiresAtSec,
    })
  }

/**
 * - `claimed`: this run minted the proofs (or reclaimed its own lost attempt).
 * - `done`: the operation is already settled, by whoever.
 * - `unpaid`: nobody paid the invoice yet.
 * - `expired`: the mint confirmed UNPAID past the quote's expiry; closed `failed`.
 * - `claimedElsewhere`: someone else claimed it; wait for their rows to sync.
 */
export type CashuTopupClaim =
  | { readonly type: "claimed"; readonly amount: number }
  | { readonly type: "done" }
  | { readonly type: "unpaid" }
  | { readonly type: "expired" }
  | { readonly type: "claimedElsewhere"; readonly counter: number | null }

export type CashuTopupClaimError =
  | MintFailure
  | CounterLockTimeoutError
  | QuoteExpiredError
  | ClaimedElsewhereError

const ownAttemptCounter = async (
  deps: CashuTopupDeps,
  operationId: CashuOperationId
): Promise<number | null> => {
  const [row] = await deps.deviceEvolu.loadQuery(
    cashuClaimAttemptQuery(deps.cashuWallet.deviceAccountId, operationId)
  )
  return row?.counter ?? null
}

/**
 * NUT-09 over the 64 slots one claim derives at `counter`: the proofs of a
 * claim whose response was lost, this device's or the winner's. Proofs
 * already stored are not inserted again (ids come from the secrets).
 */
export const reclaimTopupFromCounter = async (
  deps: CashuTopupDeps,
  loaded: LoadedCashuWallet,
  operation: CashuOperationCopy,
  counter: number
) => {
  const keysetId = operation.keysetId ?? loaded.keysetId
  const restored = await callMint(loaded.mint, () =>
    loaded.wallet.restore(counter, CASHU_OUTPUT_BLOCK, { keysetId })
  )
  if (!restored.ok) return restored
  const kept = await keepUnstoredUnspent(
    loaded,
    deps.cashuShardStore,
    restored.value.proofs
  )
  if (!kept.ok) return kept
  const rows = toNewCashuProofs(kept.value, loaded, "available", null)
  if (rows === null)
    return err(
      MintRejected({
        mint: loaded.mint,
        code: null,
        detail: "mint returned malformed proofs from the reclaim scan",
      })
    )
  const found = restored.value.proofs.length > 0
  if (rows.length > 0) await deps.cashuShardStore.insertProofs(rows)
  if (found)
    await deps.cashuShardStore.updateOperation(operation.id, { status: "done" })
  return ok({ found, amount: rows.reduce((sum, row) => sum + row.amount, 0) })
}

/**
 * The claim (cashu.md §5 steps 1–6) for one pending topup, as Linky's
 * `claimMintQuote` plus the someone-else-first checks.
 */
export const claimCashuTopup =
  (
    operationId: CashuOperationId
  ): Task<CashuTopupClaim, CashuTopupClaimError, CashuTopupDeps> =>
  async (run) => {
    const store = run.deps.cashuShardStore
    // 1. Re-read the synced operation.
    const operation = await store.loadOperation(operationId)
    if (operation === null || operation.kind !== "topup")
      return ok({ type: "done" })
    if (operation.status === "done") return ok({ type: "done" })
    if (operation.status !== "pending") return ok({ type: "expired" })
    if (operation.quoteId === null || operation.keysetId === null)
      return err(
        MintRejected({
          mint: operation.mint,
          code: null,
          detail: "the topup names no quote or keyset",
        })
      )
    const ownCounter = await ownAttemptCounter(run.deps, operationId)
    // A counter this device did not reserve: someone else is claiming it.
    if (operation.counter !== null && operation.counter !== ownCounter)
      return ok({ type: "claimedElsewhere", counter: operation.counter })

    const loadedResult = await run(loadCashuWallet(operation.mint))
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value
    const quoteId = operation.quoteId
    const keysetId = operation.keysetId
    const mintConfig = operation.locked
      ? { privkey: lockingPrivateKey(run.deps), keysetId }
      : { keysetId }

    const checkQuote = () =>
      callMint(loaded.mint, () => loaded.wallet.checkMintQuoteBolt11(quoteId))

    const scope = counterScopeOf(loaded, keysetId)
    return await withCashuCounter<CashuTopupClaim, MintFailure>(
      run.deps,
      loaded,
      scope,
      async (held) => {
        let resumeCounter = operation.counter
        let lastCollision: unknown = null
        for (let attempt = 0; attempt < MAX_COUNTER_ATTEMPTS; attempt += 1) {
          // 2. Re-check the quote before each attempt.
          const quote = await checkQuote()
          if (!quote.ok) return quote
          const state = (quote.value as MintQuoteBolt11Response).state
          if (state === "ISSUED") {
            // Our own attempt lost its response: reclaim it. Anyone else's
            // issue is theirs to finish.
            if (
              operation.counter !== null &&
              operation.counter === ownCounter
            ) {
              const reclaimed = await reclaimTopupFromCounter(
                run.deps,
                loaded,
                operation,
                operation.counter
              )
              if (!reclaimed.ok) return reclaimed
              if (reclaimed.value.found)
                return ok({ type: "claimed", amount: reclaimed.value.amount })
            }
            return ok({ type: "claimedElsewhere", counter: operation.counter })
          }
          if (state === "UNPAID") {
            const expiresAt = operation.expiresAtSec
            if (expiresAt !== null && nowSeconds(run.deps) > expiresAt) {
              // Only the mint's own UNPAID past expiry closes it, as Linky.
              await store.updateOperation(operationId, {
                status: "failed",
                error: JSON.stringify(
                  QuoteExpired({ mint: operation.mint, quoteId })
                ),
              })
              return ok({ type: "expired" })
            }
            return ok({ type: "unpaid" })
          }

          // 3. Reserve the counter, record the attempt, write it to the
          // operation; all before the outputs are derived.
          const counter = resumeCounter ?? held.current()
          await runMutationWithCompletion((options) =>
            recordCashuClaimAttempt(
              run.deps.deviceEvolu,
              {
                accountId: run.deps.cashuWallet.deviceAccountId,
                operationId,
                counter,
              },
              options
            )
          )
          await store.updateOperation(operationId, { counter, keysetId })
          // Resuming an operation advances the local counter past its block.
          await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)

          // 4. Mint with deterministic outputs.
          const minted = await loaded.wallet
            .mintProofsBolt11(operation.amount, quoteId, mintConfig, {
              type: "deterministic",
              counter,
            })
            .then(
              (proofs) => ({ ok: true as const, proofs }),
              (error: unknown) => ({ ok: false as const, error })
            )
          if (minted.ok) {
            const rows = toNewCashuProofs(
              minted.proofs,
              loaded,
              "available",
              null
            )
            if (rows === null)
              return err(
                MintRejected({
                  mint: loaded.mint,
                  code: null,
                  detail: "mint returned malformed proofs",
                })
              )
            // 5. Proofs first: a crash before `done` costs one reclaim scan.
            await store.insertProofs(rows)
            // 6. Close the operation.
            await store.updateOperation(operationId, { status: "done" })
            return ok({
              type: "claimed",
              amount: rows.reduce((sum, row) => sum + row.amount, 0),
            })
          }

          const error = minted.error
          if (!isRecoverableOutputCollision(error))
            return err(classifyMintError(loaded.mint, error))
          // The operation's own synced counter already signed: someone else
          // claimed with it.
          if (
            resumeCounter !== null &&
            resumeCounter === operation.counter &&
            isOutputsAlreadySignedError(error)
          ) {
            const recheck = await checkQuote()
            if (
              recheck.ok &&
              (recheck.value as MintQuoteBolt11Response).state === "ISSUED"
            )
              return ok({ type: "claimedElsewhere", counter: resumeCounter })
          }
          lastCollision = error
          await recoverFromCollision(loaded, scope, held, counter, error)
          resumeCounter = null
        }
        // Out of attempts: the advance is kept and the topup stays pending,
        // so the next run starts further on.
        return err(classifyMintError(loaded.mint, lastCollision))
      }
    )
  }
