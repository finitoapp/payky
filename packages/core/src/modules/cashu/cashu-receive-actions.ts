import type { Proof } from "@cashu/cashu-ts"
import {
  err,
  type MutationOptions,
  ok,
  type Result,
  type Task,
} from "@evolu/common"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { getPublicKey } from "nostr-tools/pure"
import {
  isMintRefusal,
  isRecoverableOutputCollision,
  readMintAnswer,
} from "../../cashu/cashu-mint-errors.ts"
import {
  amountToNumber,
  type CashuDeps,
  type CashuWalletDep,
  callMint,
  checkProofStates,
  classifyMintError,
  type LoadedCashuWallet,
  loadCashuWallet,
  tryMint,
} from "../../cashu/cashu-wallet.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../shared/key-derivation.ts"
import { NonNegativeInteger, TimestampMs } from "../shared/schema.ts"
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
  type CashuReceiveError,
  type CashuReclaimAmbiguousError,
  createAmountConsumedByFeeError,
  createMintUnreachableError,
  createTokenAlreadyKnownError,
  createTokenLockedError,
  createTokenPendingError,
  createTokenUndecodableError,
  type MintFailure,
  type TokenLockedError,
  type TokenUndecodableError,
} from "./cashu-errors.ts"
import {
  type CashuAttempt,
  isClaimedElsewhere,
  latestOtherAttempt,
  latestOwnAttempt,
  loadCashuAttempts,
  loadCashuReceive,
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
import { storedCashuProofIdsQuery } from "./cashu-queries.ts"
import {
  CashuAmount,
  type CashuOperationAttemptId,
  type CashuOperationId,
  type CashuTokenText,
  type MintUrl,
} from "./cashu-types.ts"
import {
  cashuProofIdFor,
  cashuReceiveOperationIdFor,
  normalizeMintUrl,
} from "./cashu-utils.ts"

/**
 * A token into the wallet: inspected without asking a mint, then swapped
 * with deterministic outputs under the counter lock. The receive's id derives
 * from the token text alone, so another Payky device receiving the same
 * message writes the same operation (cashu/0029), and nothing is written
 * while the mint cannot be reached: the NIP-17 message is the queue
 * (cashu/0030). A received token is booked in the batch that completes it (cashu/0014).
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
 * - `received`: this run swapped it, or reclaimed a lost swap.
 * - `done`: the receive is already settled, by whichever device.
 * - `receivingElsewhere`: another Payky device's attempt may still complete
 *   it; left to that device until taken over past the grace (cashu/0017).
 *   `attemptId` is that device's latest attempt, for the takeover.
 * - `receivedElsewhere`: another wallet spent the token first — Linky on the
 *   same npub, or a customer's double spend (cashu/0029). Only the marks of
 *   its empty blocks are written.
 * - `contested`: its outputs sat in a block another open operation could
 *   have signed too; past the grace they went into the wallet with no
 *   booking (cashu/0029).
 */
export type CashuReceiveOutcome =
  | {
      readonly type: "received"
      readonly amount: number
      readonly fee: number
    }
  | { readonly type: "done" }
  | {
      readonly type: "receivingElsewhere"
      readonly attemptId: CashuOperationAttemptId
    }
  | { readonly type: "receivedElsewhere" }
  | { readonly type: "contested" }

/**
 * What a run may reclaim from (cashu/0017): this device's own attempts at
 * once, another device's only once taken over past the grace, while the
 * attempt taken over is still that device's latest. `waitFor` is the other
 * device's attempt left to it.
 */
const reclaimableAttempts = (
  attempts: ReadonlyArray<CashuAttempt>,
  takeOver: CashuOperationAttemptId | undefined
): {
  readonly attempts: ReadonlyArray<CashuAttempt>
  readonly waitFor: CashuAttempt | null
} => {
  const other = latestOtherAttempt(attempts)
  return other === null || other.id === takeOver
    ? { attempts, waitFor: null }
    : { attempts: attempts.filter((attempt) => attempt.own), waitFor: other }
}

/**
 * A reclaim's outcome: received, still another device's, given to no one,
 * or gone.
 */
const reclaimOutcome = (
  reclaimed: ReclaimedSwap,
  waitFor: CashuAttempt | null,
  fee: number
): CashuReceiveOutcome =>
  reclaimed.amount !== null
    ? { type: "received", amount: reclaimed.amount, fee }
    : waitFor !== null
      ? { type: "receivingElsewhere", attemptId: waitFor.id }
      : reclaimed.contested
        ? { type: "contested" }
        : { type: "receivedElsewhere" }

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
 * The token's proofs. A token naming a keyset the wallet's snapshot of the
 * mint lacks, such as one the mint rotated to since it loaded, refreshes
 * that snapshot in place and is decoded again: only then is it
 * undecodable (cashu/0035).
 */
const decodeCashuToken = async (
  { cashuWallet }: CashuWalletDep,
  loaded: LoadedCashuWallet,
  tokenText: CashuTokenText
): Promise<
  Result<ReadonlyArray<Proof>, MintFailure | TokenUndecodableError>
> => {
  const known = decodeProofs(loaded, tokenText)
  if (known !== null) return ok(known)
  // Through the dep, which keeps the refreshed keysets for a later session.
  const refreshed = await callMint(loaded.mint, () =>
    cashuWallet.refresh(loaded.mint)
  )
  if (!refreshed.ok) return refreshed
  const proofs = decodeProofs(loaded, tokenText)
  return proofs === null ? err(createTokenUndecodableError()) : ok(proofs)
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

interface ReclaimedSwap {
  /** What was received; null when no block held the swap's outputs. */
  readonly amount: number | null
  /**
   * A block of the receive was contested and given to no one, by this
   * reclaim or by another operation's (cashu/0029).
   */
  readonly contested: boolean
}

/**
 * The outputs of a swap whose response was lost, this device's or another
 * Payky device's: NUT-09 over the attempts this run may reclaim from
 * (cashu/0029). Called only once the token is known spent, so its blocks
 * holding nothing are refused for good. `settleContest` gives a contested
 * block to no one, past the grace.
 */
const reclaimSwap =
  (
    loaded: LoadedCashuWallet,
    operationId: CashuOperationId,
    attempts: ReadonlyArray<CashuAttempt>,
    settleContest: boolean
  ): Task<ReclaimedSwap, MintFailure | CashuReclaimAmbiguousError, CashuDeps> =>
  async (run) => {
    const restored = await run(
      restoreCashuAttempts(loaded, operationId, attempts, {
        final: true,
        settleContest,
      })
    )
    if (!restored.ok) return restored
    const { found } = restored.value
    // Another operation's reclaim may have settled the contest: its mark on
    // this receive's rows is the fact (cashu/0029).
    const contested =
      restored.value.contested ||
      (await run.ok(loadCashuAttempts(operationId))).some(
        (attempt) => attempt.contested
      )
    if (!found) return ok({ amount: null, contested })
    const kept = await run(keepUnstoredUnspent(loaded, restored.value.proofs))
    if (!kept.ok) return kept
    const rows = toNewCashuProofs(run.deps, kept.value, loaded.mint)
    await run.ok(settleCashuReceive(operationId, rows))
    return ok({ amount: sumCashuAmounts(rows), contested })
  }

const swapUnderLock =
  (
    loaded: LoadedCashuWallet,
    token: InspectedCashuToken,
    fee: number,
    resumeCounter: number | null,
    takeOver: CashuOperationAttemptId | undefined,
    settleContest: boolean,
    writePending: ((options: MutationOptions) => void) | undefined,
    held: HeldCashuCounter
  ): Task<CashuReceiveOutcome, CashuReceiveError, CashuDeps> =>
  async (run) => {
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
      // A block reserved fresh by this run; a resumed one may hold an
      // earlier call's outputs (cashu/0029).
      const fresh = nextCounter === null
      // Prepared first, so exactly its slots are reserved before the mint
      // is called (cashu/0039).
      const prepared = await tryMint(() =>
        loaded.wallet.prepareSwapToReceive(
          token.tokenText,
          {
            keysetId: loaded.keysetId,
            ...(privkey === undefined ? {} : { privkey }),
          },
          { type: "deterministic", counter }
        )
      )
      if (!prepared.ok)
        return err(classifyMintError(loaded.mint, prepared.error))
      await held.reserve(operationId, counter, {
        slots:
          (prepared.value.keepOutputs?.length ?? 0) +
          (prepared.value.sendOutputs?.length ?? 0),
        role: "swap",
        ...(index === 0 && writePending !== undefined
          ? { alsoWrite: writePending }
          : {}),
      })
      const swapped: Result<ReadonlyArray<Proof>, unknown> = await tryMint(
        async () =>
          (await loaded.wallet.completeSwap(prepared.value, privkey)).keep
      )
      if (swapped.ok) {
        const rows = toNewCashuProofs(run.deps, swapped.value, loaded.mint)
        await run.ok(settleCashuReceive(operationId, rows))
        return ok({ type: "received", amount: sumCashuAmounts(rows), fee })
      }

      const error = swapped.error
      // Spent at the swap: another wallet swapped it first. When it was a
      // Payky device, its attempt is on record, reclaimed past the grace
      // (cashu/0017, cashu/0029). Only the marks the reclaim learned are
      // written, never `failed`.
      if (readMintAnswer(error) === "proofsSpent") {
        if (fresh) await held.reject(operationId, counter, "swap")
        const reclaimable = reclaimableAttempts(
          await run.ok(loadCashuAttempts(operationId)),
          takeOver
        )
        const reclaimed = await run(
          reclaimSwap(loaded, operationId, reclaimable.attempts, settleContest)
        )
        if (!reclaimed.ok) return reclaimed
        return ok(reclaimOutcome(reclaimed.value, reclaimable.waitFor, fee))
      }
      // Another call is spending the token right now: this one signed
      // nothing, and the token is tried again (cashu/0030).
      if (readMintAnswer(error) === "proofsPending") {
        if (fresh) await held.reject(operationId, counter, "swap")
        return err(createTokenPendingError({ mint: loaded.mint }))
      }
      // A refusal is this device's answer, kept on its own attempt; the
      // receive shared with every device is never closed `failed`
      // (cashu/0029).
      if (!isRecoverableOutputCollision(error)) {
        const failure = classifyMintError(loaded.mint, error)
        if (fresh && isMintRefusal(error))
          await held.reject(operationId, counter, "swap")
        return err(failure)
      }
      if (nextCounter !== null && readMintAnswer(error) === "outputsSigned") {
        const current = await run.ok(loadCashuReceive(operationId))
        if (current?.status === "done") return ok({ type: "done" })
      }
      if (fresh) await held.reject(operationId, counter, "swap")
      await recoverFromCollision(loaded, loaded.keysetId, held, counter, error)
      return attempt(index + 1, null, error)
    }

    return attempt(0, resumeCounter, null)
  }

/**
 * Receives a token `inspectCashuToken` accepted.
 *
 * `takeOver` is another device's attempt whose grace is over (cashu/0017).
 * While it is still that device's latest, this run reclaims from that
 * device's attempts too, and swaps in its place when the token is unspent.
 * A newer attempt of that device's is waited for again. `settleContest`
 * gives a block contested past the grace to no one (cashu/0029).
 */
export const receiveCashuToken =
  (
    token: InspectedCashuToken,
    {
      takeOver,
      settleContest = false,
    }: {
      readonly takeOver?: CashuOperationAttemptId
      readonly settleContest?: boolean
    } = {}
  ): Task<CashuReceiveOutcome, CashuReceiveError, CashuDeps> =>
  async (run) => {
    const { evolu } = run.deps
    const operationId = token.receiveOperationId

    // The mint and the token's proofs; nothing is written when the mint
    // cannot be reached.
    const loadedResult = await run(loadCashuWallet(token.mint))
    if (!loadedResult.ok) return loadedResult
    const loaded = loadedResult.value
    const decoded = await decodeCashuToken(run.deps, loaded, token.tokenText)
    if (!decoded.ok) return decoded
    const proofs = decoded.value

    // Another device got there first. A receive with no attempt carries
    // nobody's: no device reached the swap, so this one takes it over. One
    // with attempts of this device's resumes at its latest in the mint's
    // keyset. Another device's attempts are left to it until taken over
    // (cashu/0017). Every attempt counts whatever the receive's `status`
    // reads: a status is no fact (cashu/0029).
    const existing = await run.ok(loadCashuReceive(operationId))
    if (existing?.status === "done") return ok({ type: "done" })
    const attempts =
      existing === null ? [] : await run.ok(loadCashuAttempts(operationId))
    const reclaimable = reclaimableAttempts(attempts, takeOver)
    const waitFor = isClaimedElsewhere(attempts) ? reclaimable.waitFor : null
    const resumeCounter =
      latestOwnAttempt(attempts, loaded.keysetId)?.counter ?? null

    // A proof the wallet holds in any state means the token is known.
    const stored = await evolu.loadQuery(
      storedCashuProofIdsQuery(
        proofs.map((proof) => cashuProofIdFor(proof.secret))
      )
    )
    if (resumeCounter === null && waitFor === null && stored.length > 0)
      return err(createTokenAlreadyKnownError())

    // The fee must leave something to sign (cashu/0009).
    const fee = amountToNumber(loaded.wallet.getFeesForProofs([...proofs]))
    if (token.amount - fee <= 0)
      return err(createAmountConsumedByFeeError({ amount: token.amount, fee }))

    // NUT-07, which every mint Payky works with lists (cashu/0033). A spent
    // token's outputs are reclaimed from the attempts on record this run may
    // reclaim (cashu/0017, 0029).
    const states = await checkProofStates(loaded, proofs)
    if (!states.ok) return states
    if (states.value.some((state) => state === "spent")) {
      const reclaimed = await run(
        reclaimSwap(loaded, operationId, reclaimable.attempts, settleContest)
      )
      if (!reclaimed.ok) return reclaimed
      return ok(reclaimOutcome(reclaimed.value, reclaimable.waitFor, fee))
    }
    if (states.value.some((state) => state !== "unspent"))
      return err(
        createMintUnreachableError({
          mint: loaded.mint,
          detail: "the mint did not answer for every proof",
        })
      )

    // Another device's attempt that has not swapped yet is that device's to
    // finish until taken over (cashu/0017).
    if (waitFor !== null)
      return ok({ type: "receivingElsewhere", attemptId: waitFor.id })

    // Once more over fresh rows: another device may have received it, or
    // reserved its attempt, while the mint answered.
    const fresh = await run.ok(loadCashuReceive(operationId))
    if (fresh?.status === "done") return ok({ type: "done" })
    const freshAttempts = await run.ok(loadCashuAttempts(operationId))
    const freshWaitFor = reclaimableAttempts(freshAttempts, takeOver).waitFor
    if (
      fresh !== null &&
      isClaimedElsewhere(freshAttempts) &&
      freshWaitFor !== null
    )
      return ok({ type: "receivingElsewhere", attemptId: freshWaitFor.id })

    // The pending receive goes in with the first reservation, one batch
    // (cashu/0029): no failure before the swap leaves it without this
    // device's attempt.
    const writePending =
      fresh === null
        ? (options: MutationOptions) => {
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
              options
            )
            evolu.upsert(
              "cashuReceive",
              {
                id: operationId,
                tokenText: token.tokenText,
                fee: NonNegativeInteger(fee),
              },
              options
            )
          }
        : undefined

    const outcome = await run(
      withCashuCounter(loaded, loaded.keysetId, (held) =>
        swapUnderLock(
          loaded,
          token,
          fee,
          resumeCounter,
          takeOver,
          settleContest,
          writePending,
          held
        )
      )
    )
    return outcome
  }
