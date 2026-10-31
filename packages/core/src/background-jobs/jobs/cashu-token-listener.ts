import { ok, type Run, sqliteTrue, type Task } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { CashuDeps } from "../../cashu/cashu-wallet.ts"
import {
  type CashuTokenMessage,
  fetchCashuTokenMessages,
  subscribeCashuTokenMessages,
} from "../../integrations/nostr/nostr-cashu-inbox.ts"
import type { NostrDep } from "../../integrations/nostr/nostr-client.ts"
import { deriveCashuAccountTransactionId } from "../../modules/account-transaction/account-transaction-utils.ts"
import type { CashuReceiveError } from "../../modules/cashu/cashu-errors.ts"
import {
  CLAIMED_ELSEWHERE_GRACE_MS,
  loadCashuReceive,
} from "../../modules/cashu/cashu-guards.ts"
import {
  cashuOperationAttemptsQuery,
  cashuReceiveQuery,
  cashuTrustedMintsQuery,
} from "../../modules/cashu/cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "../../modules/cashu/cashu-receive-actions.ts"
import { upsertCashuTokenArrival } from "../../modules/cashu/cashu-token-arrival-actions.ts"
import {
  CashuAmount,
  type CashuOperationAttemptId,
  type CashuOperationId,
  type CashuTokenArrivalState,
  type MintUrl,
} from "../../modules/cashu/cashu-types.ts"
import {
  cashuReceiveOperationIdFor,
  trustedCashuMintsOf,
} from "../../modules/cashu/cashu-utils.ts"
import { holdCashuReceive } from "../../modules/payment/payment-actions.ts"
import {
  cashuTokenCandidatePaymentsQuery,
  paymentsHoldingCashuReceiveQuery,
} from "../../modules/payment/payment-queries.ts"
import { derivePaymentStatus } from "../../modules/payment/payment-status-utils.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import { reconcileAccountTransaction } from "../../modules/reconciliation-claim/reconciliation-claim-actions.ts"
import { activeReconciliationClaimByAccountTransactionIdQuery } from "../../modules/reconciliation-claim/reconciliation-claim-queries.ts"
import { runMutationWithCompletion } from "../../modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../../modules/shared/key-derivation.ts"

/**
 * The token half of the Cashu job (cashu/0006, 0029, 0030): reads
 * NIP-17 token messages, matches each to a payment, makes the payment hold
 * its receive id, and receives it.
 *
 * - The NIP-17 message is the queue: every tick retries each message in the
 *   window whose receive is not settled, so a token whose mint was down, or
 *   that arrived while the app was closed, is simply tried again. A mint's
 *   refusal is asked about once a run, and a token another call holds
 *   pending is tried again (cashu/0030).
 * - Trust (cashu/0016, 0020): Payky receives only from a mint the merchant
 *   trusts now, in the list this device knows (cashu/0013), with no `MAIN_MINT_URL`
 *   fallback (cashu/0018). A token from any other mint is left alone until
 *   its mint is trusted.
 * - Matching (cashu/0028): the mint plays no part. A NUT-18 payload goes to
 *   the payment its id names, if that payment is open. Anything else, a bare
 *   token included, is received unassigned: an amount names no payment for
 *   sure, and two devices could each give one token to a payment of its
 *   price.
 * - A token spent with no attempt on record to hold its outputs is not
 *   concluded spent elsewhere for good: another Payky device's attempt may
 *   not have synced in yet (cashu/0030). The wait screen says it is being
 *   checked for the grace, then that another wallet received it, and the
 *   message sleeps, asking no mint, until an attempt or a settlement of its
 *   receive arrives and wakes it.
 * - A token another Payky device booked before the payment reached it is
 *   held and claimed by the payment its NUT-18 payload names (cashu/0025).
 * - Another Payky device's attempt is left to that device for the grace,
 *   counted from when this listener first saw it, then taken over
 *   (cashu/0017).
 * - A block another open operation could have signed too is tried again for
 *   the grace, counted the same way, then given to no one (cashu/0029).
 */

export type CashuTokenListenerDeps = CashuDeps & NostrDep

export interface CashuTokenCandidate {
  readonly paymentId: PaymentId
  readonly open: boolean
}

export type CashuTokenMatch =
  | { readonly type: "payment"; readonly paymentId: PaymentId }
  | { readonly type: "unassigned" }

export const matchCashuToken = ({
  requestId,
  candidates,
}: {
  /** The NUT-18 payload's id, or null for a bare token. */
  readonly requestId: string | null
  readonly candidates: ReadonlyArray<CashuTokenCandidate>
}): CashuTokenMatch => {
  const named =
    requestId === null
      ? undefined
      : candidates.find((candidate) => candidate.paymentId === requestId)
  return named === undefined || !named.open
    ? { type: "unassigned" }
    : { type: "payment", paymentId: named.paymentId }
}

const finalRefusals = new Set<CashuReceiveError["type"]>([
  "TokenLocked",
  "TokenUndecodable",
  "TokenAlreadyKnown",
  "AmountConsumedByFee",
  "MintRejected",
  // A mint that does not list NUT-07 and NUT-09 (cashu/0033).
  "CashuMintUnsupported",
])

/**
 * - `settled`: nothing more to do with the message.
 * - `retryLater`: the mint did not answer; tried again after a pause.
 * - `receivingElsewhere`: another Payky device's attempt may still complete
 *   it; tried again after a pause, and taken over past the grace
 *   (cashu/0017).
 * - `untrustedMint`: its mint is not trusted; tried again once it is
 *   (cashu/0020).
 * - `contestPending`: its outputs may sit in a block another open operation
 *   could have signed too; tried again after a pause, and given to no one
 *   past the grace (cashu/0029).
 * - `spentElsewhere`: the token is spent and no attempt on record holds its
 *   outputs, as far as this device knows; it sleeps until a fact about its
 *   receive arrives (cashu/0030).
 */
export type CashuTokenMessageOutcome =
  | { readonly type: "settled" }
  | {
      readonly type: "spentElsewhere"
      readonly operationId: CashuOperationId
    }
  | { readonly type: "retryLater" }
  | { readonly type: "contestPending" }
  | {
      readonly type: "receivingElsewhere"
      readonly attemptId: CashuOperationAttemptId
    }
  | { readonly type: "untrustedMint"; readonly mintUrl: MintUrl }

const settledOutcome: CashuTokenMessageOutcome = { type: "settled" }
const retryLaterOutcome: CashuTokenMessageOutcome = { type: "retryLater" }

/**
 * The mints the merchant trusts, as this device knows them: no row means
 * none, never `MAIN_MINT_URL` (cashu/0018).
 */
const loadTrustedMintUrls: Task<
  ReadonlySet<MintUrl>,
  never,
  CashuTokenListenerDeps
> = async (run) =>
  ok(
    new Set(
      trustedCashuMintsOf(
        await run.deps.evolu.loadQuery(cashuTrustedMintsQuery)
      )
    )
  )

const loadCandidates: Task<
  ReadonlyArray<CashuTokenCandidate>,
  never,
  CashuTokenListenerDeps
> = async (run) => {
  const now = run.deps.date.now()
  const rows = await run.deps.evolu.loadQuery(cashuTokenCandidatePaymentsQuery)
  return ok(
    rows.map((row) => ({
      paymentId: row.paymentId,
      open:
        derivePaymentStatus({
          canceledAt: row.canceledAt,
          confirmedPaidAt: row.confirmedPaidAt,
          expiresAt: row.expiresAt,
          hasActiveClaim: row.hasActiveClaim === sqliteTrue,
          now,
        }) === "pending",
    }))
  )
}

/** One message, from inspection to the receive. */
export const processCashuTokenMessage =
  (
    message: CashuTokenMessage,
    {
      takeOver,
      settleContest = false,
      spentPastGrace = false,
    }: {
      /** Another device's attempt whose grace is over (cashu/0017). */
      readonly takeOver?: CashuOperationAttemptId
      /** A contest stood for the grace: give its block to no one (cashu/0029). */
      readonly settleContest?: boolean
      /**
       * The token has read spent elsewhere for the grace: the wait screen
       * says another wallet received it (cashu/0030).
       */
      readonly spentPastGrace?: boolean
    } = {}
  ): Task<CashuTokenMessageOutcome, never, CashuTokenListenerDeps> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const inspected = await inspectCashuToken(
      message.tokenText,
      bytesToHex(deriveNostrSecretKey(run.deps.masterKey))
    )
    if (!inspected.ok) return ok(settledOutcome)
    const token = inspected.value
    // A receive is never closed `failed`: the mint's refusal may have been
    // one device's or one moment's, and a refusal that holds is remembered
    // for the run (cashu/0030).
    const operation = await run.ok(loadCashuReceive(token.receiveOperationId))
    const booked = operation?.status === "done"
    const requestId = message.payload?.requestId ?? null

    // Only a NUT-18 payload names a payment (cashu/0028).
    const candidates = requestId === null ? [] : await run.ok(loadCandidates)
    const match = matchCashuToken({ requestId, candidates })
    // The payment the arrival is shown on (cashu/0034): the open one the
    // payload names, or the one it names that already holds this receive,
    // open or not. A token's outcome can come long after its payment
    // expired, and the payment still settles by its hold (cashu/0025).
    const shownOn =
      match.type === "payment"
        ? match.paymentId
        : ((
            await evolu.loadQuery(
              paymentsHoldingCashuReceiveQuery(token.receiveOperationId)
            )
          ).find((holder) => holder.paymentId === requestId)?.paymentId ?? null)
    // The claim of the payment holding the receive on its booking, whichever
    // device wrote it; nothing when a claim exists (cashu/0025).
    const transactionId = deriveCashuAccountTransactionId(
      token.receiveOperationId
    )
    const report = async (
      state: CashuTokenArrivalState,
      fee: number | null,
      failure: string | null = null
    ): Promise<void> => {
      if (shownOn === null) return
      await runMutationWithCompletion((options) =>
        upsertCashuTokenArrival(
          evolu,
          {
            paymentId: shownOn,
            mintUrl: token.mint,
            amount: CashuAmount(token.amount),
            fee,
            state,
            failure,
          },
          { ...options, owner: evoluOwner }
        )
      )
    }

    // A booked receive is claimed for the payment holding it, whichever
    // device wrote the claim (cashu/0025), and reads received only on the
    // payment it is claimed for. Another payment holding it too, as when
    // the token was sent for both, is told the wallet already holds the
    // token, so its QR comes back (cashu/0034).
    const reportBooked = async (fee: number | null): Promise<void> => {
      await run.ok(reconcileAccountTransaction(transactionId))
      const [claim] = await evolu.loadQuery(
        activeReconciliationClaimByAccountTransactionIdQuery(transactionId)
      )
      if (claim?.paymentId === shownOn) await report("received", fee)
      else await report("failed", null, "TokenAlreadyKnown")
    }

    // Booked by a device the payment had not synced to: the open payment the
    // payload names holds the receive now, and the payment it is shown on
    // takes its claim, also one that expired holding it (cashu/0025,
    // cashu/0034). A receive some payment holds already is that payment's:
    // another one the payload names takes no hold of it.
    if (booked) {
      const holders = await evolu.loadQuery(
        paymentsHoldingCashuReceiveQuery(token.receiveOperationId)
      )
      if (shownOn === null) return ok(settledOutcome)
      if (holders.length === 0)
        await run.ok(
          holdCashuReceive({
            paymentId: shownOn,
            receiveOperationId: token.receiveOperationId,
          })
        )
      else if (!holders.some((holder) => holder.paymentId === shownOn))
        return ok(settledOutcome)
      await reportBooked(operation.fee)
      return ok(settledOutcome)
    }

    // Payky receives only from a mint it trusts now (cashu/0016, 0020).
    if (!(await run.ok(loadTrustedMintUrls)).has(token.mint)) {
      await report("untrustedMint", null)
      return ok({ type: "untrustedMint", mintUrl: token.mint })
    }

    // The payment holds the receive id before anyone receives the token.
    if (match.type === "payment")
      await run.ok(
        holdCashuReceive({
          paymentId: match.paymentId,
          receiveOperationId: token.receiveOperationId,
        })
      )
    await report("receiving", null)

    const result = await run(
      receiveCashuToken(token, { takeOver, settleContest })
    )
    if (!result.ok) {
      const failure = result.error.type
      if (finalRefusals.has(failure)) {
        await report("failed", null, failure)
        return ok(settledOutcome)
      }
      // Another of the account's operations, still open, could have signed
      // the slots the token's outputs may sit at (cashu/0029): tried again,
      // and given to no one past the grace.
      if (failure === "CashuReclaimAmbiguous") {
        await report("receivingElsewhere", null)
        return ok({ type: "contestPending" })
      }
      // Another call is spending the token right now (cashu/0030).
      if (failure === "TokenPending") {
        await report("receiving", null)
        return ok(retryLaterOutcome)
      }
      await report("waitingForMint", null, failure)
      return ok(retryLaterOutcome)
    }
    const outcome = result.value
    if (outcome.type === "received") {
      await reportBooked(outcome.fee)
      return ok(settledOutcome)
    }
    const receive = await run.ok(loadCashuReceive(token.receiveOperationId))
    if (outcome.type === "done" || receive?.status === "done") {
      await reportBooked(receive?.fee ?? null)
      return ok(settledOutcome)
    }
    // Another Payky device's attempt may still complete it, and then it pays
    // the payment: `receivingElsewhere`, the QR hidden (cashu/0020), until
    // the attempt is taken over (cashu/0017).
    if (outcome.type === "receivingElsewhere") {
      await report("receivingElsewhere", null)
      return ok({ type: "receivingElsewhere", attemptId: outcome.attemptId })
    }
    // Given to no one past the grace: the sats are in the wallet with no
    // booking, and the payment stays unpaid (cashu/0029).
    if (outcome.type === "contested") {
      await report("contested", null)
      return ok(settledOutcome)
    }
    // The token is spent and no attempt on record held its outputs, as far
    // as this device knows: another Payky device's may not have synced in
    // yet. Said to be checked for the grace, then received by another wallet
    // (cashu/0030). The receive is never closed `failed` (cashu/0029).
    await report(
      spentPastGrace ? "receivedElsewhere" : "checkingElsewhere",
      null
    )
    return ok({ type: "spentElsewhere", operationId: token.receiveOperationId })
  }

/** How long a message waits before its next try. */
const RETRY_AFTER_MS = 30_000

/**
 * The graces a message is waiting out, each with when this listener first
 * saw its cause: another device's attempt (cashu/0017), a contested block
 * (cashu/0029), a token spent elsewhere (cashu/0030).
 */
export interface CashuTokenGraces {
  readonly elsewhere?: {
    readonly attemptId: CashuOperationAttemptId
    readonly ms: number
  }
  readonly contested?: number
  readonly spent?: number
}

/**
 * The graces after a pass (cashu/0017). Only an outcome that is a fact
 * about the message moves them: a pass the mint did not answer, or one
 * that found the token being spent right now, leaves every grace where it
 * was, so a flaky mint cannot keep a grace from running out. A newer
 * attempt of another device starts its grace again; a contest reached
 * through a takeover keeps the takeover, or the next pass waits for that
 * device again and the contest's grace never runs out.
 */
export const advanceCashuTokenGraces = (
  graces: CashuTokenGraces,
  outcome: CashuTokenMessageOutcome,
  nowMs: number
): CashuTokenGraces => {
  switch (outcome.type) {
    case "retryLater":
      return graces
    case "contestPending":
      return {
        ...(graces.elsewhere === undefined
          ? {}
          : { elsewhere: graces.elsewhere }),
        contested: graces.contested ?? nowMs,
      }
    case "receivingElsewhere":
      return {
        elsewhere:
          graces.elsewhere?.attemptId === outcome.attemptId
            ? graces.elsewhere
            : { attemptId: outcome.attemptId, ms: nowMs },
      }
    case "spentElsewhere":
      return { spent: graces.spent ?? nowMs }
    case "settled":
    case "untrustedMint":
      return {}
  }
}

/**
 * The listener over one run: the messages in the window and since, each
 * tried until settled, and only while started. Its state lives with the job
 * that owns it.
 */
export const createCashuTokenListener = (run: Run<CashuTokenListenerDeps>) => {
  const messages = new Map<string, CashuTokenMessage>()
  const settled = new Set<string>()
  const nextTryAtMs = new Map<string, number>()
  /**
   * Messages whose mint was not trusted, by that mint: each tick re-reads
   * only the local trust list, asks no mint and writes no arrival, and works
   * on the message again once its mint is trusted (cashu/0020).
   */
  const untrustedMintOf = new Map<string, MintUrl>()
  /** The graces each message is waiting out (`advanceCashuTokenGraces`). */
  const gracesOf = new Map<string, CashuTokenGraces>()
  /**
   * Messages asleep past that grace, each with how to stop watching its
   * receive: no tick works on them until a fact about it arrives
   * (cashu/0030).
   */
  const asleep = new Map<string, () => void>()
  let wakeListener: (() => void) | null = null
  let stopSubscription: (() => void) | null = null
  /**
   * Moves on every start and stop: a tick or a start that awaited across a
   * `stop` sees it moved, and writes none of the state the stop cleared.
   */
  let started = 0

  /** What this device knows of a receive: its attempts and its row. */
  const fingerprintOf = async (
    operationId: CashuOperationId
  ): Promise<string> => {
    const { evolu } = run.deps
    return JSON.stringify([
      await evolu.loadQuery(cashuOperationAttemptsQuery(operationId)),
      await evolu.loadQuery(cashuReceiveQuery(operationId)),
    ])
  }

  const wake = (rumorId: string): void => {
    asleep.get(rumorId)?.()
    asleep.delete(rumorId)
    nextTryAtMs.delete(rumorId)
    wakeListener?.()
  }

  /**
   * Puts the message to sleep until its receive's facts differ from
   * `before`, what the pass that found the token spent had seen.
   */
  const sleepUntilFactsChange = async (
    rumorId: string,
    operationId: CashuOperationId,
    before: string
  ): Promise<void> => {
    const { evolu } = run.deps
    const attempts = cashuOperationAttemptsQuery(operationId)
    const receive = cashuReceiveQuery(operationId)
    const onChange = () => {
      const now = JSON.stringify([
        evolu.getQueryRows(attempts),
        evolu.getQueryRows(receive),
      ])
      if (asleep.has(rumorId) && now !== before) wake(rumorId)
    }
    const unsubscribes = [
      evolu.subscribeQuery(attempts)(onChange),
      evolu.subscribeQuery(receive)(onChange),
    ]
    asleep.set(rumorId, () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    })
    // A fact that arrived while the pass ran wakes it at once.
    if ((await fingerprintOf(operationId)) !== before) wake(rumorId)
  }

  const tick = async (): Promise<void> => {
    const at = started
    // Stopped, the Cashu account disabled, maybe while this tick awaited:
    // no message is worked on.
    const isStopped = () => stopSubscription === null || started !== at
    let trusted: ReadonlySet<MintUrl> | null = null
    for (const message of [...messages.values()]) {
      if (isStopped()) return
      const nowMs = run.deps.date.now().getTime()
      if (settled.has(message.rumorId) || asleep.has(message.rumorId)) continue
      if ((nextTryAtMs.get(message.rumorId) ?? 0) > nowMs) continue
      const untrustedMint = untrustedMintOf.get(message.rumorId)
      if (untrustedMint !== undefined) {
        trusted ??= await run.ok(loadTrustedMintUrls)
        if (isStopped()) return
        if (!trusted.has(untrustedMint)) continue
        untrustedMintOf.delete(message.rumorId)
      }
      const graces = gracesOf.get(message.rumorId) ?? {}
      const isPastGrace = (since: number | undefined): boolean =>
        since !== undefined && nowMs - since >= CLAIMED_ELSEWHERE_GRACE_MS
      const takeOver = isPastGrace(graces.elsewhere?.ms)
        ? graces.elsewhere?.attemptId
        : undefined
      const settleContest = isPastGrace(graces.contested)
      const spentPastGrace = isPastGrace(graces.spent)
      // What the pass sees of the receive, for the sleep that may follow.
      const receiveId = cashuReceiveOperationIdFor(message.tokenText)
      const before = spentPastGrace ? await fingerprintOf(receiveId) : ""
      const outcome = await run.ok(
        processCashuTokenMessage(message, {
          takeOver,
          settleContest,
          spentPastGrace,
        })
      )
      if (isStopped()) return
      const next = advanceCashuTokenGraces(graces, outcome, nowMs)
      gracesOf.set(message.rumorId, next)
      if (outcome.type === "spentElsewhere") {
        // Checked for the grace, a fresh mint answer once it is over; then
        // asleep until a fact about the receive arrives (cashu/0030).
        const since = next.spent ?? nowMs
        if (spentPastGrace)
          await sleepUntilFactsChange(
            message.rumorId,
            outcome.operationId,
            before
          )
        else
          nextTryAtMs.set(message.rumorId, since + CLAIMED_ELSEWHERE_GRACE_MS)
        continue
      }
      if (outcome.type === "settled") settled.add(message.rumorId)
      else if (outcome.type === "untrustedMint")
        untrustedMintOf.set(message.rumorId, outcome.mintUrl)
      else nextTryAtMs.set(message.rumorId, nowMs + RETRY_AFTER_MS)
    }
  }

  return {
    /** Loads the window and listens for new messages; idempotent. */
    start: async (onNewMessage: () => void): Promise<void> => {
      if (stopSubscription !== null) return
      started += 1
      const at = started
      wakeListener = onNewMessage
      stopSubscription = subscribeCashuTokenMessages(run.deps, (message) => {
        if (messages.has(message.rumorId)) return
        messages.set(message.rumorId, message)
        onNewMessage()
      })
      const inWindow = await run.ok(fetchCashuTokenMessages)
      if (started !== at || stopSubscription === null) return
      for (const message of inWindow) messages.set(message.rumorId, message)
      onNewMessage()
    },
    /**
     * Stops listening and forgets the loaded messages: they stay in their
     * NIP-17 window, and the next `start` loads them again (cashu/0030).
     */
    stop: (): void => {
      started += 1
      stopSubscription?.()
      stopSubscription = null
      wakeListener = null
      for (const stopWatching of asleep.values()) stopWatching()
      asleep.clear()
      gracesOf.clear()
      messages.clear()
      nextTryAtMs.clear()
      untrustedMintOf.clear()
    },
    tick,
  }
}
