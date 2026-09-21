import { createRun, type InferRow, ok } from "@evolu/common"
import type { Event } from "nostr-tools/pure"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import type { CashuTokenSummary } from "@/core/cashu/cashu-wallet.ts"
import {
  CHAT_RUMOR_KIND,
  GIFT_WRAP_TIMESTAMP_SKEW_SECONDS,
  type GiftWrapSubscription,
  type SubscribeGiftWraps,
  subscribeGiftWraps as subscribeGiftWrapsOnRelays,
  unwrapGiftWrap,
} from "@/core/linky/nostr-inbox.ts"
import { activeCashuAccountsQuery } from "@/core/modules/account/account-cashu-queries.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import {
  accountTransactionCashuByQuoteIdQuery,
  accountTransactionCashuByReceiveOperationIdQuery,
} from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { parseCashuPaymentRequestPayload } from "@/core/modules/payment/payment-cashu-request-utils.ts"
import { unclaimedCashuPaymentsQuery } from "@/core/modules/payment/payment-queries.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  CashuMintUrlSchema,
  IntegerSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

/**
 * How long to keep asking the shared wallet whether *it* has the token the
 * mint reported spent: Linky on another device may have received it first,
 * and its record reaches this device only once the wallet shard syncs.
 */
const DEFAULT_SETTLED_RECHECK_DELAYS_MS: ReadonlyArray<number> = [
  5_000, 15_000, 45_000, 120_000,
]

interface NostrCashuInboxJobOptions {
  readonly subscribeGiftWraps?: SubscribeGiftWraps
  readonly settledRecheckDelaysMs?: ReadonlyArray<number>
}

/** A token that arrived in the inbox, with the request id when the wallet quoted one. */
interface IncomingCashuPayment extends CashuTokenSummary {
  readonly requestId: string | null
}

type UnclaimedCashuPayment = InferRow<
  ReturnType<typeof unclaimedCashuPaymentsQuery>
>

/**
 * Settles cashu payments paid as ecash rather than over Lightning. The
 * bitcoin tab's NUT-18 request tells the customer's wallet to send the proofs
 * to the account's Nostr inbox (NIP-17); this job reads that inbox, receives
 * what arrives into the shared wallet and records it as the account
 * transaction that claims the payment — matched by the request id when the
 * wallet echoes it, otherwise (Linky sends the bare token) by mint and amount
 * against the unclaimed payments.
 */
export const createNostrCashuInboxJob =
  ({
    subscribeGiftWraps = subscribeGiftWrapsOnRelays,
    settledRecheckDelaysMs = DEFAULT_SETTLED_RECHECK_DELAYS_MS,
  }: NostrCashuInboxJobOptions = {}): BackgroundJob =>
  (run) => {
    const context: BackgroundJobContext = {
      ...run.deps,
      console: run.deps.console.child("nostr-cashu-inbox-job"),
    }

    if (context.cashuWallet === null || context.nostrInbox === null) {
      context.console.info(
        "Skipped the Nostr cashu inbox: no wallet or identity for this runtime."
      )
      return ok({ [Symbol.asyncDispose]: async () => undefined })
    }

    return ok(
      createNostrCashuInboxManager({
        context,
        wallet: context.cashuWallet,
        inbox: context.nostrInbox,
        subscribeGiftWraps,
        settledRecheckDelaysMs,
      })
    )
  }

export const startNostrCashuInboxJob = createNostrCashuInboxJob()

const createNostrCashuInboxManager = ({
  context,
  wallet,
  inbox,
  subscribeGiftWraps,
  settledRecheckDelaysMs,
}: {
  readonly context: BackgroundJobContext
  readonly wallet: NonNullable<BackgroundJobContext["cashuWallet"]>
  readonly inbox: NonNullable<BackgroundJobContext["nostrInbox"]>
  readonly subscribeGiftWraps: SubscribeGiftWraps
  readonly settledRecheckDelaysMs: ReadonlyArray<number>
}): AsyncDisposable => {
  let hasAccounts = false
  let disposed = false
  let subscription: GiftWrapSubscription | null = null
  let subscriptionGeneration = 0
  const seenWrapIds = new Set<string>()
  const recheckTimers = new Set<ReturnType<typeof setTimeout>>()
  const queue = createKeyedTaskQueue<
    "refresh" | "subscribe" | `wrap:${string}`
  >({
    onError: (error) => context.onError(error),
  })

  const nowSeconds = (): number =>
    Math.floor(context.date.now().getTime() / 1000)

  const closeSubscription = (): void => {
    subscription?.close()
    subscription = null
  }

  const openSubscription = async (): Promise<void> => {
    closeSubscription()
    if (disposed || !hasAccounts) return
    subscriptionGeneration += 1
    const generation = subscriptionGeneration

    const identity = await inbox.current()
    if (disposed || generation !== subscriptionGeneration) return

    const opened = await subscribeGiftWraps({
      relays: identity.relays,
      pubkey: identity.pubkey,
      since: nowSeconds() - GIFT_WRAP_TIMESTAMP_SKEW_SECONDS,
      onWrap: (wrap) => {
        if (seenWrapIds.has(wrap.id)) return
        seenWrapIds.add(wrap.id)
        queue.enqueue(`wrap:${wrap.id}`, () =>
          handleWrap(wrap, identity.secretKey)
        )
      },
    })
    if (disposed || generation !== subscriptionGeneration) {
      opened.close()
      return
    }
    subscription = opened
    context.console.info("Listening for cashu payments in the Nostr inbox.", {
      pubkey: identity.pubkey,
      relayCount: identity.relays.length,
    })
  }

  const resubscribeSoon = (): void => {
    queue.enqueue("subscribe", openSubscription)
  }

  const describeIncoming = async (
    content: string
  ): Promise<IncomingCashuPayment | null> => {
    const payload = parseCashuPaymentRequestPayload(content)
    if (payload === null) {
      const summary = await wallet.describeToken(content)
      return summary === null ? null : { ...summary, requestId: null }
    }

    const tokenText = await wallet.encodeToken({
      mintUrl: payload.mint,
      unit: payload.unit,
      proofs: payload.proofs,
    })
    if (tokenText === null) return null
    const summary = await wallet.describeToken(tokenText)
    return summary === null
      ? null
      : { ...summary, requestId: payload.id ?? null }
  }

  const findTargetPayment = async (
    incoming: IncomingCashuPayment
  ): Promise<UnclaimedCashuPayment | null> => {
    const mintUrl = CashuMintUrlSchema.decode(incoming.mintUrl)
    const candidates = await context.evolu.loadQuery(
      incoming.requestId === null
        ? unclaimedCashuPaymentsQuery({
            mintUrl,
            amountSats: NonNegativeIntegerSchema.decode(incoming.amountSats),
          })
        : unclaimedCashuPaymentsQuery({
            mintUrl,
            quoteId: NonEmptyStringSchema.decode(incoming.requestId),
          })
    )
    return candidates[0] ?? null
  }

  const isQuoteSettled = async (
    target: UnclaimedCashuPayment
  ): Promise<boolean> => {
    const existing = await context.evolu.loadQuery(
      accountTransactionCashuByQuoteIdQuery({
        mintUrl: target.mintUrl,
        quoteId: target.quoteId,
      })
    )
    return existing.length > 0
  }

  const isReceiveUsed = async (
    receiveOperationId: string
  ): Promise<boolean> => {
    const existing = await context.evolu.loadQuery(
      accountTransactionCashuByReceiveOperationIdQuery(
        NonEmptyStringSchema.decode(receiveOperationId)
      )
    )
    return existing.length > 0
  }

  /**
   * The customer paid the quoted amount; the mint's swap fee on receipt is
   * the wallet's cost, not money the customer withheld, so the transaction
   * carries the face value — which is also what the claim matches on.
   */
  const recordSettlement = async (
    target: UnclaimedCashuPayment,
    receiveOperationId: string,
    amountSats: number
  ): Promise<void> => {
    await context.lockManager.request(
      `cashu-topup-${target.mintUrl}-${target.quoteId}`,
      async () => {
        if (await isQuoteSettled(target)) {
          context.console.debug("Skipped already settled cashu quote.", {
            paymentId: target.paymentId,
            quoteId: target.quoteId,
          })
          return
        }

        const run = createRun(context)
        const accountTransactionId = await run.ok(
          createAccountTransaction({
            accountId: target.accountId,
            amount: IntegerSchema.decode(amountSats),
            currency: "BTC",
            occurredAt: TimestampMsSchema.decode(context.date.now().getTime()),
            note: null,
            internalTransferGroupId: null,
            source: { deviceId: null, source: "auto" },
            cashu: {
              mintUrl: target.mintUrl,
              quoteId: target.quoteId,
              lnInvoice: target.lnInvoice,
              receiveOperationId:
                NonEmptyStringSchema.decode(receiveOperationId),
            },
          })
        )
        const paymentId = await run.ok(
          reconcileAccountTransaction(accountTransactionId)
        )
        context.console.info("Settled a cashu payment from the Nostr inbox.", {
          accountTransactionId,
          amount: amountSats,
          paymentId,
          quoteId: target.quoteId,
        })
      }
    )
  }

  /**
   * True when the shared wallet holds this token through a finished receive
   * that has not settled anything yet — then that receive settles `target`.
   */
  const settleFromWalletRecord = async (
    target: UnclaimedCashuPayment,
    incoming: IncomingCashuPayment
  ): Promise<boolean> => {
    const transfer = await wallet.findReceivedTransfer(incoming.tokenText)
    if (transfer === null) return false
    if (await isReceiveUsed(transfer.operationId)) {
      context.console.warn(
        "Ignored a cashu token that already settled another payment.",
        {
          paymentId: target.paymentId,
          receiveOperationId: transfer.operationId,
        }
      )
      return true
    }
    await recordSettlement(target, transfer.operationId, incoming.amountSats)
    return true
  }

  const recheckLater = (
    wrapId: string,
    target: UnclaimedCashuPayment,
    incoming: IncomingCashuPayment,
    attempt: number
  ): void => {
    const delayMs = settledRecheckDelaysMs[attempt]
    if (delayMs === undefined) {
      context.console.warn(
        "A cashu token for a pending payment was spent outside this wallet.",
        { paymentId: target.paymentId, quoteId: target.quoteId }
      )
      return
    }
    const timer = setTimeout(() => {
      recheckTimers.delete(timer)
      if (disposed) return
      queue.enqueue(`wrap:${wrapId}`, async () => {
        if (await isQuoteSettled(target)) return
        if (!(await settleFromWalletRecord(target, incoming))) {
          recheckLater(wrapId, target, incoming, attempt + 1)
        }
      })
    }, delayMs)
    ;(timer as { readonly unref?: () => void }).unref?.()
    recheckTimers.add(timer)
  }

  const settleIncoming = async (
    wrapId: string,
    incoming: IncomingCashuPayment
  ): Promise<void> => {
    const target = await findTargetPayment(incoming)
    if (target === null) {
      context.console.info("No unclaimed cashu payment matches a token.", {
        mintUrl: incoming.mintUrl,
        amount: incoming.amountSats,
        requestId: incoming.requestId,
      })
      return
    }
    if (target.amountSats !== incoming.amountSats) {
      context.console.warn("A cashu token does not pay its request's amount.", {
        paymentId: target.paymentId,
        expected: target.amountSats,
        received: incoming.amountSats,
      })
      return
    }
    if (await isQuoteSettled(target)) return

    const outcome = await wallet.receiveToken(incoming.tokenText)
    switch (outcome.kind) {
      case "received":
        await recordSettlement(target, outcome.operationId, incoming.amountSats)
        return
      case "alreadyKnown":
        if (!(await settleFromWalletRecord(target, incoming))) {
          context.console.info(
            "The wallet knows the token but has not finished receiving it.",
            { paymentId: target.paymentId, operationId: outcome.operationId }
          )
        }
        return
      case "alreadySpent":
        if (!(await settleFromWalletRecord(target, incoming))) {
          recheckLater(wrapId, target, incoming, 0)
        }
    }
  }

  const handleWrap = async (
    wrap: Event,
    secretKey: Uint8Array
  ): Promise<void> => {
    const rumor = await unwrapGiftWrap(wrap, secretKey)
    if (rumor === null || rumor.kind !== CHAT_RUMOR_KIND) return
    const incoming = await describeIncoming(rumor.content)
    if (incoming === null) return
    await settleIncoming(wrap.id, incoming)
  }

  const refreshAccounts = async (): Promise<void> => {
    const rows = await context.evolu.loadQuery(activeCashuAccountsQuery)
    const hadAccounts = hasAccounts
    hasAccounts = rows.length > 0
    if (hasAccounts && !hadAccounts) resubscribeSoon()
    if (!hasAccounts && hadAccounts) closeSubscription()
  }

  const refreshSoon = (): void => {
    queue.enqueue("refresh", refreshAccounts)
  }

  const unsubscribeAccounts = context.evolu.subscribeQuery(
    activeCashuAccountsQuery
  )(refreshSoon)
  const unsubscribeIdentity = inbox.subscribe(resubscribeSoon)
  // A relay connection dropped while offline is reopened as soon as the
  // browser reports connectivity; the look-back window covers what was missed.
  const onOnline = (): void => {
    if (hasAccounts) resubscribeSoon()
  }
  globalThis.addEventListener?.("online", onOnline)

  context.console.info("Started the Nostr cashu inbox job.")
  refreshSoon()

  return {
    async [Symbol.asyncDispose]() {
      if (disposed) return
      disposed = true

      queue[Symbol.dispose]()
      for (const timer of recheckTimers) clearTimeout(timer)
      recheckTimers.clear()
      globalThis.removeEventListener?.("online", onOnline)
      unsubscribeAccounts()
      unsubscribeIdentity()
      closeSubscription()
      context.console.info("Stopped the Nostr cashu inbox job.")
    },
  }
}
