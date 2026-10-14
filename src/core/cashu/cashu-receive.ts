import type { Proof } from "@cashu/cashu-ts"
import { err, ok, type Result, type Task } from "@evolu/common"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"

import {
  CASHU_OUTPUT_BLOCK,
  counterScopeOf,
  isOutputsAlreadySignedError,
  isRecoverableOutputCollision,
  isTokenAlreadySpentError,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  withCashuCounter,
} from "@/core/cashu/cashu-counters.ts"
import {
  keepUnstoredUnspent,
  toNewCashuProofs,
} from "@/core/cashu/cashu-restore.ts"
import type { CashuTopupDeps } from "@/core/cashu/cashu-topup.ts"
import {
  AmountConsumedByFee,
  type AmountConsumedByFeeError,
  type CounterLockTimeoutError,
  callMint,
  checkProofStates,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
  type MintFailure,
  MintRejected,
  MintUnreachable,
  ProofsSpent,
  type ProofsSpentError,
  TokenLocked,
  type TokenLockedError,
} from "@/core/cashu/cashu-wallet.ts"
import { defineError } from "@/core/error.ts"
import {
  cashuClaimAttemptQuery,
  recordCashuClaimAttempt,
} from "@/core/evolu/device-cashu.ts"
import {
  CashuAmount,
  type CashuOperationId,
  type CashuTokenText,
  type MintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import {
  cashuOperationIdFor,
  normalizeMintUrl,
} from "@/core/modules/cashu/cashu-utils.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

/**
 * A token into the shared wallet, in Linky's order (`linkshu/docs/
 * receive.md`, cashu.md §5 "Token"), with the someone-else-first rules of
 * decision 11: Linky shares the nostr key and may receive the same message
 * first; whoever does writes the `receive` under one id, derived from the
 * text alone.
 */

const createTokenUndecodableError = defineError("TokenUndecodable")()
export type TokenUndecodableError = ReturnType<
  typeof createTokenUndecodableError
>

const createTokenAlreadyKnownError = defineError("TokenAlreadyKnown")()
export type TokenAlreadyKnownError = ReturnType<
  typeof createTokenAlreadyKnownError
>

/** What a token is before any mint is asked (receive step 1). */
export interface InspectedCashuToken {
  readonly tokenText: CashuTokenText
  readonly mint: MintUrl
  /** Face value, before the mint's input fee. */
  readonly amount: number
  readonly receiveOperationId: CashuOperationId
  /** The nostr key signs P2PK inputs locked to it (NUT-11). */
  readonly lockedToUs: boolean
}

const lockedPubkeys = async (
  secrets: ReadonlyArray<string>
): Promise<ReadonlyArray<ReadonlyArray<string>> | null> => {
  const { getSecretKind, getP2PKExpectedWitnessPubkeys } = await import(
    "@cashu/cashu-ts"
  )
  try {
    return secrets.flatMap((secret) => {
      if (!secret.startsWith("[")) return []
      return getSecretKind(secret) === "P2PK"
        ? [getP2PKExpectedWitnessPubkeys(secret)]
        : []
    })
  } catch {
    return null
  }
}

/**
 * Receive step 1, writing nothing and asking no mint: the token's mint and
 * face value, its receive id, and whether a P2PK lock leaves it to someone
 * else (`TokenLocked`). Proofs locked to Payky's nostr key are signed with it.
 */
export const inspectCashuToken = async (
  tokenText: CashuTokenText,
  nostrSecretKeyHex: string
): Promise<
  Result<InspectedCashuToken, TokenLockedError | TokenUndecodableError>
> => {
  const { getTokenMetadata } = await import("@cashu/cashu-ts")
  let metadata: ReturnType<typeof getTokenMetadata>
  try {
    metadata = getTokenMetadata(tokenText)
  } catch {
    return err(createTokenUndecodableError())
  }
  const mint = normalizeMintUrl(metadata.mint)
  const amount = Number(metadata.amount)
  if (mint === null || !(amount > 0) || (metadata.unit ?? "sat") !== "sat")
    return err(createTokenUndecodableError())

  const locks = await lockedPubkeys(
    metadata.incompleteProofs.map((proof) => proof.secret)
  )
  if (locks === null) return err(createTokenUndecodableError())
  const xOnly = getPublicKey(hexToBytes(nostrSecretKeyHex))
  const ours = new Set([`02${xOnly}`, `03${xOnly}`, xOnly])
  const lockedElsewhere = locks.some(
    (pubkeys) =>
      pubkeys.length > 0 && !pubkeys.some((pubkey) => ours.has(pubkey))
  )
  if (lockedElsewhere)
    return err(TokenLocked({ detail: "the token is locked to another key" }))

  return ok({
    tokenText,
    mint,
    amount,
    receiveOperationId: cashuOperationIdFor(`receive|${tokenText}`),
    lockedToUs: locks.length > 0,
  })
}

export type CashuReceiveOutcome =
  | {
      readonly type: "received"
      readonly amount: number
      readonly fee: number
    }
  | { readonly type: "done" }
  | { readonly type: "claimedElsewhere" }

export type CashuReceiveError =
  | MintFailure
  | TokenLockedError
  | TokenUndecodableError
  | TokenAlreadyKnownError
  | AmountConsumedByFeeError
  | ProofsSpentError
  | CounterLockTimeoutError

const nostrKeyHex = (deps: CashuTopupDeps): string =>
  bytesToHex(deriveNostrSecretKey(deps.masterKey))

const ownAttemptCounter = async (
  deps: CashuTopupDeps,
  operationId: CashuOperationId
): Promise<number | null> => {
  const [row] = await deps.deviceEvolu.loadQuery(
    cashuClaimAttemptQuery(deps.cashuWallet.deviceAccountId, operationId)
  )
  return row?.counter ?? null
}

const decodeProofs = (
  loaded: LoadedCashuWallet,
  tokenText: CashuTokenText
): ReadonlyArray<Proof> | null => {
  try {
    return loaded.wallet.decodeToken(tokenText).proofs
  } catch {
    return null
  }
}

/**
 * The outputs of this device's own attempt that lost its response: NUT-09
 * over its recorded slot. Found ones not yet stored go in, and the receive
 * closes `done`.
 */
const reclaimOwnAttempt = async (
  deps: CashuTopupDeps,
  loaded: LoadedCashuWallet,
  operationId: CashuOperationId,
  counter: number
) => {
  const restored = await callMint(loaded.mint, () =>
    loaded.wallet.restore(counter, CASHU_OUTPUT_BLOCK, {
      keysetId: loaded.keysetId,
    })
  )
  if (!restored.ok) return restored
  const kept = await keepUnstoredUnspent(
    loaded,
    deps.cashuShardStore,
    restored.value.proofs
  )
  if (!kept.ok) return kept
  const rows = toNewCashuProofs(kept.value, loaded, "available", null) ?? []
  if (restored.value.proofs.length === 0) return ok(null)
  await deps.cashuShardStore.insertProofs(rows)
  await deps.cashuShardStore.updateOperation(operationId, { status: "done" })
  return ok(rows.reduce((sum, row) => sum + row.amount, 0))
}

/** Receive steps 2–10 for a token step 1 accepted. */
export const receiveCashuToken =
  (
    token: InspectedCashuToken
  ): Task<CashuReceiveOutcome, CashuReceiveError, CashuTopupDeps> =>
  async (run) => {
    const store = run.deps.cashuShardStore
    const operationId = token.receiveOperationId

    // 2. Load the mint and decode against its keysets; nothing is written
    // when it cannot be reached (decision 12: the message is the queue).
    const loadedResult = await run(loadCashuWallet(token.mint))
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value
    const proofs = decodeProofs(loaded, token.tokenText)
    if (proofs === null) return err(createTokenUndecodableError())

    // 3. Someone else got there first.
    const existing = await store.loadOperation(operationId)
    const ownCounter = await ownAttemptCounter(run.deps, operationId)
    if (existing?.status === "done") return ok({ type: "done" })
    if (existing?.status === "pending" && ownCounter === null)
      return ok({ type: "claimedElsewhere" })
    const resumeCounter =
      existing?.status === "pending" && existing.counter === ownCounter
        ? ownCounter
        : null

    // 4. Dedup by each proof secret, any state.
    const stored = new Set<string>(
      (await store.loadProofs()).map((proof) => proof.secret)
    )
    if (resumeCounter === null && proofs.some((p) => stored.has(p.secret)))
      return err(createTokenAlreadyKnownError())

    // 5. The fee must leave something to sign.
    const fee = Number(loaded.wallet.getFeesForProofs([...proofs]))
    if (token.amount - fee <= 0)
      return err(AmountConsumedByFee({ amount: token.amount, fee }))

    // 6. NUT-07, when the mint lists it.
    if (loaded.supports(7)) {
      const states = await checkProofStates(loaded, proofs)
      if (!states.ok) return states
      if (states.value.some((state) => state === "spent")) {
        if (resumeCounter !== null) {
          const reclaimed = await reclaimOwnAttempt(
            run.deps,
            loaded,
            operationId,
            resumeCounter
          )
          if (!reclaimed.ok) return reclaimed
          if (reclaimed.value !== null)
            return ok({ type: "received", amount: reclaimed.value, fee })
        }
        return err(ProofsSpent({ mint: loaded.mint }))
      }
      if (states.value.some((state) => state !== "unspent"))
        return err(
          MintUnreachable({
            mint: loaded.mint,
            detail: "the mint did not answer for every proof",
          })
        )
    }

    // 7. Dedup once more over freshly loaded rows: Linky may have received
    // it while the mint answered.
    const fresh = await store.loadOperation(operationId)
    if (fresh?.status === "done") return ok({ type: "done" })
    if (fresh?.status === "pending" && ownCounter === null && existing === null)
      return ok({ type: "claimedElsewhere" })

    // 8. The pending receive, before the swap.
    if (fresh === null || fresh.status === "failed")
      await store.insertOperation({
        kind: "receive",
        status: "pending",
        mint: loaded.mint,
        unit: "sat",
        keysetId: null,
        amount: CashuAmount(token.amount),
        feeReserve: null,
        inputsTotal: null,
        quoteId: null,
        invoice: null,
        sourceMint: null,
        counter: null,
        locked: null,
        expiresAtSec: null,
        createdAtSec: Math.floor(run.deps.date.now().getTime() / 1000),
        tokenText: token.tokenText,
        error: null,
      })

    // 9. Swap with deterministic outputs.
    const scope = counterScopeOf(loaded, loaded.keysetId)
    const privkey = token.lockedToUs ? nostrKeyHex(run.deps) : undefined
    return await withCashuCounter<CashuReceiveOutcome, CashuReceiveError>(
      run.deps,
      loaded,
      scope,
      async (held) => {
        let lastCollision: unknown = null
        let nextCounter = resumeCounter
        for (let attempt = 0; attempt < MAX_COUNTER_ATTEMPTS; attempt += 1) {
          const counter = nextCounter ?? held.current()
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
          await store.updateOperation(operationId, {
            counter,
            keysetId: loaded.keysetId,
          })
          await held.advanceTo(counter + CASHU_OUTPUT_BLOCK)

          const swapped = await loaded.wallet
            .receive(
              token.tokenText,
              {
                keysetId: loaded.keysetId,
                ...(privkey === undefined ? {} : { privkey }),
              },
              { type: "deterministic", counter }
            )
            .then(
              (received) => ({ ok: true as const, received }),
              (error: unknown) => ({ ok: false as const, error })
            )
          if (swapped.ok) {
            const rows = toNewCashuProofs(
              swapped.received,
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
            // 10. Proofs first, then `done`.
            await store.insertProofs(rows)
            await store.updateOperation(operationId, { status: "done" })
            return ok({
              type: "received",
              amount: rows.reduce((sum, row) => sum + row.amount, 0),
              fee,
            })
          }

          const error = swapped.error
          // Spent at the swap: someone else swapped it first. Writing
          // `failed` here could overwrite their `done`.
          if (isTokenAlreadySpentError(error))
            return ok({ type: "claimedElsewhere" })
          if (!isRecoverableOutputCollision(error)) {
            const failure = classifyMintError(loaded.mint, error)
            if (failure.type === "MintRejected")
              await store.updateOperation(operationId, {
                status: "failed",
                error: JSON.stringify(failure),
              })
            return err(failure)
          }
          if (
            nextCounter !== null &&
            isOutputsAlreadySignedError(error) &&
            (await store.loadOperation(operationId))?.status === "done"
          )
            return ok({ type: "done" })
          lastCollision = error
          await recoverFromCollision(loaded, scope, held, counter, error)
          nextCounter = null
        }
        return err(classifyMintError(loaded.mint, lastCollision))
      }
    )
  }
