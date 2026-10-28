import { ok, type Run, sqliteTrue, type Task } from "@evolu/common"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { CashuDeps } from "../../cashu/cashu-wallet.ts"
import {
  type CashuTokenMessage,
  fetchCashuTokenMessages,
  subscribeCashuTokenMessages,
} from "../../integrations/nostr/nostr-cashu-inbox.ts"
import type { NostrDep } from "../../integrations/nostr/nostr-client.ts"
import type { CashuReceiveError } from "../../modules/cashu/cashu-errors.ts"
import { loadCashuReceive } from "../../modules/cashu/cashu-guards.ts"
import { cashuTrustedMintsQuery } from "../../modules/cashu/cashu-queries.ts"
import {
  inspectCashuToken,
  receiveCashuToken,
} from "../../modules/cashu/cashu-receive-actions.ts"
import { upsertCashuTokenArrival } from "../../modules/cashu/cashu-token-arrival-actions.ts"
import {
  CashuAmount,
  type CashuTokenArrivalState,
} from "../../modules/cashu/cashu-types.ts"
import { orderTrustedCashuMints } from "../../modules/cashu/cashu-utils.ts"
import { holdCashuReceive } from "../../modules/payment/payment-actions.ts"
import { cashuTokenCandidatePaymentsQuery } from "../../modules/payment/payment-queries.ts"
import { derivePaymentStatus } from "../../modules/payment/payment-status-utils.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import { runMutationWithCompletion } from "../../modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "../../modules/shared/key-derivation.ts"

/**
 * The token half of the Cashu job (cashu/0006, 0008, 0011, 0015): reads
 * NIP-17 token messages, matches each to a payment, makes the payment hold
 * its receive id, and receives it.
 *
 * - The NIP-17 message is the queue: every tick retries each message in the
 *   window whose receive is not settled, so a token whose mint was down, or
 *   that arrived while the app was closed, is simply tried again.
 * - Trust (cashu/0017): Payky receives only from a mint the merchant trusts
 *   now. A token from any other mint is left alone.
 * - Matching: the mint plays no part. A NUT-18 payload goes to the payment
 *   its id names, if that payment is open; a bare token to the one open
 *   payment of its face amount. Anything else is received unassigned.
 * - A token another wallet spent first (Linky on the same npub, cashu/0015)
 *   leaves the payment unpaid; the wait screen says so.
 */

export type CashuTokenListenerDeps = CashuDeps & NostrDep

export interface CashuTokenCandidate {
  readonly paymentId: PaymentId
  readonly amountSats: number
  readonly open: boolean
}

export type CashuTokenMatch =
  | { readonly type: "payment"; readonly paymentId: PaymentId }
  | { readonly type: "unassigned" }

export const matchCashuToken = ({
  amount,
  requestId,
  candidates,
}: {
  readonly amount: number
  /** The NUT-18 payload's id, or null for a bare token. */
  readonly requestId: string | null
  readonly candidates: ReadonlyArray<CashuTokenCandidate>
}): CashuTokenMatch => {
  if (requestId !== null) {
    const named = candidates.find(
      (candidate) => candidate.paymentId === requestId
    )
    return named === undefined || !named.open
      ? { type: "unassigned" }
      : { type: "payment", paymentId: named.paymentId }
  }
  const fitting = candidates.filter(
    (candidate) => candidate.open && candidate.amountSats === amount
  )
  const [only] = fitting
  return fitting.length === 1 && only !== undefined
    ? { type: "payment", paymentId: only.paymentId }
    : { type: "unassigned" }
}

const finalRefusals = new Set<CashuReceiveError["type"]>([
  "TokenLocked",
  "TokenUndecodable",
  "TokenAlreadyKnown",
  "AmountConsumedByFee",
  "MintRejected",
])

/**
 * - `settled`: nothing more to do with the message.
 * - `retryLater`: the mint did not answer, or another device's receive is
 *   still pending; tried again after a pause.
 */
export type CashuTokenMessageOutcome = "settled" | "retryLater"

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
      amountSats: row.amountSats,
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
    message: CashuTokenMessage
  ): Task<CashuTokenMessageOutcome, never, CashuTokenListenerDeps> =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const inspected = await inspectCashuToken(
      message.tokenText,
      bytesToHex(deriveNostrSecretKey(run.deps.masterKey))
    )
    if (!inspected.ok) return ok("settled")
    const token = inspected.value
    const operation = await run.ok(loadCashuReceive(token.receiveOperationId))
    if (operation?.status === "done" || operation?.status === "failed")
      return ok("settled")

    const match = matchCashuToken({
      amount: token.amount,
      requestId: message.payload?.requestId ?? null,
      candidates: await run.ok(loadCandidates),
    })
    const report = async (
      state: CashuTokenArrivalState,
      fee: number | null,
      failure: string | null = null
    ): Promise<void> => {
      if (match.type === "unassigned") return
      await runMutationWithCompletion((options) =>
        upsertCashuTokenArrival(
          evolu,
          {
            paymentId: match.paymentId,
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

    // Payky receives only from a mint it trusts now (cashu/0017).
    const trusted = await evolu.loadQuery(cashuTrustedMintsQuery)
    if (!orderTrustedCashuMints(trusted).includes(token.mint)) {
      await report("untrustedMint", null)
      return ok("settled")
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

    const result = await run(receiveCashuToken(token))
    if (!result.ok) {
      const failure = result.error.type
      if (finalRefusals.has(failure)) {
        await report("failed", null, failure)
        return ok("settled")
      }
      await report("waitingForMint", null, failure)
      return ok("retryLater")
    }
    const outcome = result.value
    if (outcome.type === "received") {
      await report("received", outcome.fee)
      return ok("settled")
    }
    const receive = await run.ok(loadCashuReceive(token.receiveOperationId))
    if (outcome.type === "done" || receive?.status === "done") {
      await report("received", receive?.fee ?? null)
      return ok("settled")
    }
    await report("receivedElsewhere", null)
    // Another device's receive may still complete; anything else is final.
    return ok(receive?.status === "pending" ? "retryLater" : "settled")
  }

/** How long a message waits before its next try. */
const RETRY_AFTER_MS = 30_000

/**
 * The listener over one run: the messages in the window and since, each
 * tried until settled. Its state lives with the job that owns it.
 */
export const createCashuTokenListener = (run: Run<CashuTokenListenerDeps>) => {
  const messages = new Map<string, CashuTokenMessage>()
  const settled = new Set<string>()
  const nextTryAtMs = new Map<string, number>()
  let stopSubscription: (() => void) | null = null

  const tick = async (): Promise<void> => {
    for (const message of [...messages.values()]) {
      const nowMs = run.deps.date.now().getTime()
      if (settled.has(message.rumorId)) continue
      if ((nextTryAtMs.get(message.rumorId) ?? 0) > nowMs) continue
      const outcome = await run.ok(processCashuTokenMessage(message))
      if (outcome === "settled") settled.add(message.rumorId)
      else nextTryAtMs.set(message.rumorId, nowMs + RETRY_AFTER_MS)
    }
  }

  return {
    /** Loads the window and listens for new messages; idempotent. */
    start: async (onNewMessage: () => void): Promise<void> => {
      if (stopSubscription !== null) return
      stopSubscription = subscribeCashuTokenMessages(run.deps, (message) => {
        if (messages.has(message.rumorId)) return
        messages.set(message.rumorId, message)
        onNewMessage()
      })
      for (const message of await run.ok(fetchCashuTokenMessages))
        messages.set(message.rumorId, message)
      onNewMessage()
    },
    stop: (): void => {
      stopSubscription?.()
      stopSubscription = null
    },
    tick,
  }
}
