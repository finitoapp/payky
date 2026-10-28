import type { Proof } from "@cashu/cashu-ts"
import { err, ok, type Result, type Task } from "@evolu/common"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"
import {
  amountToNumber,
  type CashuDeps,
  callMint,
  checkProofStates,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../shared/key-derivation.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
import {
  loadCashuBooking,
  upsertCashuBooking,
} from "./cashu-booking-actions.ts"
import {
  CASHU_OUTPUT_BLOCK,
  type HeldCashuCounter,
  isOutputsAlreadySignedError,
  isRecoverableOutputCollision,
  isTokenAlreadySpentError,
  MAX_COUNTER_ATTEMPTS,
  recoverFromCollision,
  withCashuCounter,
} from "./cashu-counter-actions.ts"
import {
  type CashuReceiveError,
  createAmountConsumedByFeeError,
  createMintRejectedError,
  createMintUnreachableError,
  createTokenAlreadyKnownError,
  createTokenLockedError,
  createTokenUndecodableError,
  type MintFailure,
  type TokenLockedError,
  type TokenUndecodableError,
} from "./cashu-errors.ts"
import { loadCashuReceive, loadOwnCashuAttempt } from "./cashu-guards.ts"
import {
  keepUnstoredUnspent,
  type NewCashuProof,
  sumCashuAmounts,
  toNewCashuProofs,
  updateCashuOperation,
  upsertCashuOperationRow,
  upsertCashuProofRows,
} from "./cashu-proof-actions.ts"
import { storedCashuProofIdsQuery } from "./cashu-queries.ts"
import {
  CashuAmount,
  type CashuOperationId,
  type CashuTokenText,
  type MintUrl,
} from "./cashu-types.ts"
import {
  cashuProofIdFor,
  cashuReceiveOperationIdFor,
  encodeCashuError,
  normalizeMintUrl,
} from "./cashu-utils.ts"

/**
 * A token into the wallet: inspected without asking a mint, then swapped
 * with deterministic outputs under the counter lock. The receive's id derives
 * from the token text alone, so another Payky device receiving the same
 * message writes the same operation (cashu/0015), and nothing is written
 * while the mint cannot be reached: the NIP-17 message is the queue
 * (cashu/0008). A received token is booked in the batch that completes it (cashu/0014).
 */

/** What a token is before any mint is asked. */
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
 * Writing nothing and asking no mint: the token's mint and face value, its
 * receive id, and whether a P2PK lock leaves it to someone else
 * (`TokenLocked`). Proofs locked to Payky's nostr key are signed with it.
 */
export const inspectCashuToken = async (
  tokenText: CashuTokenText,
  nostrSecretKeyHex: string
): Promise<
  Result<InspectedCashuToken, TokenLockedError | TokenUndecodableError>
> => {
  const { getTokenMetadata } = await import("@cashu/cashu-ts")
  const metadata = (() => {
    try {
      return getTokenMetadata(tokenText)
    } catch {
      return null
    }
  })()
  if (metadata === null) return err(createTokenUndecodableError())
  const mint = normalizeMintUrl(metadata.mint)
  const amount = amountToNumber(metadata.amount)
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
    return err(
      createTokenLockedError({ detail: "the token is locked to another key" })
    )

  return ok({
    tokenText,
    mint,
    amount,
    receiveOperationId: cashuReceiveOperationIdFor(tokenText),
    lockedToUs: locks.length > 0,
  })
}

/**
 * - `received`: this run swapped it, or reclaimed its own lost swap.
 * - `done`: the receive is already settled, by whichever device.
 * - `receivedElsewhere`: another wallet spent the token first — another
 *   Payky device, or Linky on the same npub (cashu/0015). Nothing written.
 */
export type CashuReceiveOutcome =
  | {
      readonly type: "received"
      readonly amount: number
      readonly fee: number
    }
  | { readonly type: "done" }
  | { readonly type: "receivedElsewhere" }

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

/** Proofs in, the receive `done` and its booking (cashu/0014): one batch. */
const settleCashuReceive =
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
 * The outputs of this device's own swap that lost its response: NUT-09 over
 * its recorded slot. Null when the mint signed nothing there.
 */
const reclaimOwnSwap =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    counter: number
  ): Task<number | null, MintFailure, CashuDeps> =>
  async (run) => {
    const restored = await callMint(loaded.mint, () =>
      loaded.wallet.restore(counter, CASHU_OUTPUT_BLOCK, {
        keysetId: loaded.keysetId,
      })
    )
    if (!restored.ok) return restored
    if (restored.value.proofs.length === 0) return ok(null)
    const kept = await run(keepUnstoredUnspent(loaded, restored.value.proofs))
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(kept.value, loaded.mint) ?? []
    await run.ok(settleCashuReceive(operationId, rows))
    return ok(sumCashuAmounts(rows))
  }

const swapUnderLock =
  (
    loaded: LoadedCashuWallet,
    token: InspectedCashuToken,
    fee: number,
    resumeCounter: number | null,
    held: HeldCashuCounter
  ): Task<CashuReceiveOutcome, CashuReceiveError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const operationId = token.receiveOperationId
    const privkey = token.lockedToUs
      ? bytesToHex(deriveNostrSecretKey(run.deps.masterKey))
      : undefined

    const attempt = async (
      index: number,
      nextCounter: number | null,
      lastCollision: unknown
    ): Promise<Result<CashuReceiveOutcome, CashuReceiveError>> => {
      if (index >= MAX_COUNTER_ATTEMPTS)
        return err(classifyMintError(loaded.mint, lastCollision))
      const counter = nextCounter ?? held.current()
      await held.reserve(operationId, counter)
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
          (received) => ok(received),
          (error: unknown) => err(error)
        )
      if (swapped.ok) {
        const rows = toNewCashuProofs(swapped.value, loaded.mint)
        if (rows === null)
          return err(
            createMintRejectedError({
              mint: loaded.mint,
              code: null,
              detail: "mint returned malformed proofs",
            })
          )
        await run.ok(settleCashuReceive(operationId, rows))
        return ok({ type: "received", amount: sumCashuAmounts(rows), fee })
      }

      const error = swapped.error
      // Spent at the swap: another wallet swapped it first. Writing `failed`
      // here could overwrite another device's `done`.
      if (isTokenAlreadySpentError(error))
        return ok({ type: "receivedElsewhere" })
      if (!isRecoverableOutputCollision(error)) {
        const failure = classifyMintError(loaded.mint, error)
        if (failure.type === "MintRejected")
          await runMutationWithCompletion((options) =>
            updateCashuOperation(
              evolu,
              operationId,
              { status: "failed", error: encodeCashuError(failure) },
              { ...options, owner: evoluOwner }
            )
          )
        return err(failure)
      }
      if (nextCounter !== null && isOutputsAlreadySignedError(error)) {
        const current = await run.ok(loadCashuReceive(operationId))
        if (current?.status === "done") return ok({ type: "done" })
      }
      await recoverFromCollision(loaded, loaded.keysetId, held, counter, error)
      return attempt(index + 1, null, error)
    }

    return attempt(0, resumeCounter, null)
  }

/** Receives a token `inspectCashuToken` accepted. */
export const receiveCashuToken =
  (
    token: InspectedCashuToken
  ): Task<CashuReceiveOutcome, CashuReceiveError, CashuDeps> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const operationId = token.receiveOperationId

    // The mint and the token's proofs; nothing is written when the mint
    // cannot be reached.
    const loadedResult = await run(loadCashuWallet(token.mint))
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value
    const proofs = decodeProofs(loaded, token.tokenText)
    if (proofs === null) return err(createTokenUndecodableError())

    // Another device got there first.
    const existing = await run.ok(loadCashuReceive(operationId))
    const ownCounter = await run.ok(loadOwnCashuAttempt(operationId))
    if (existing?.status === "done") return ok({ type: "done" })
    if (existing?.status === "pending" && ownCounter === null)
      return ok({ type: "receivedElsewhere" })
    const resumeCounter =
      existing?.status === "pending" && existing.counter === ownCounter
        ? ownCounter
        : null

    // A proof the wallet holds in any state means the token is known.
    const stored = await evolu.loadQuery(
      storedCashuProofIdsQuery(
        proofs.map((proof) => cashuProofIdFor(proof.secret))
      )
    )
    if (resumeCounter === null && stored.length > 0)
      return err(createTokenAlreadyKnownError())

    // The fee must leave something to sign (cashu/0009).
    const fee = amountToNumber(loaded.wallet.getFeesForProofs([...proofs]))
    if (token.amount - fee <= 0)
      return err(createAmountConsumedByFeeError({ amount: token.amount, fee }))

    // NUT-07, when the mint lists it.
    if (loaded.supports(7)) {
      const states = await checkProofStates(loaded, proofs)
      if (!states.ok) return states
      if (states.value.some((state) => state === "spent")) {
        if (resumeCounter !== null) {
          const reclaimed = await run(
            reclaimOwnSwap(loaded, operationId, resumeCounter)
          )
          if (!reclaimed.ok) return reclaimed
          if (reclaimed.value !== null)
            return ok({ type: "received", amount: reclaimed.value, fee })
        }
        return ok({ type: "receivedElsewhere" })
      }
      if (states.value.some((state) => state !== "unspent"))
        return err(
          createMintUnreachableError({
            mint: loaded.mint,
            detail: "the mint did not answer for every proof",
          })
        )
    }

    // Once more over fresh rows: another device may have received it while
    // the mint answered.
    const fresh = await run.ok(loadCashuReceive(operationId))
    if (fresh?.status === "done") return ok({ type: "done" })
    if (fresh?.status === "pending" && ownCounter === null && existing === null)
      return ok({ type: "receivedElsewhere" })

    // The pending receive, before the swap.
    if (fresh === null || fresh.status === "failed")
      await runMutationWithCompletion((options) => {
        const mutationOptions = { ...options, owner: evoluOwner }

        upsertCashuOperationRow(
          evolu,
          {
            id: operationId,
            kind: "receive",
            status: "pending",
            mintUrl: loaded.mint,
            amount: CashuAmount(token.amount),
            keysetId: loaded.keysetId,
          },
          mutationOptions
        )
        evolu.upsert(
          "cashuReceive",
          {
            id: operationId,
            tokenText: token.tokenText,
            fee: NonNegativeInteger(fee),
          },
          mutationOptions
        )
      })

    const outcome = await run(
      withCashuCounter(loaded, loaded.keysetId, (held) =>
        swapUnderLock(loaded, token, fee, resumeCounter, held)
      )
    )
    return outcome
  }
