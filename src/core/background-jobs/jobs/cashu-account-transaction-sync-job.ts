import { createRun, ok } from "@evolu/common"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import type { CashuTopupReceipt } from "@/core/cashu/cashu-wallet.ts"
import { activeCashuAccountsQuery } from "@/core/modules/account/account-cashu-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionCashuByQuoteIdQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  CashuMintUrlSchema,
  IntegerSchema,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

const DEFAULT_RECHECK_INTERVAL_MS = 60_000

interface CashuAccountRow {
  readonly id: AccountId
  readonly mintUrl: string
}

interface CashuAccountTransactionSyncJobOptions {
  readonly recheckIntervalMs?: number
}

type RecordTopupResult = "created" | "duplicate" | "lock-unavailable"

/**
 * Settles cashu payments. The wallet library owns the hard part — watching
 * each mint quote, minting the proofs once the invoice is paid, resuming
 * after a restart — so this job only keeps those watchers alive while a cashu
 * account is active and records every minted topup as a BTC account
 * transaction, which `reconcileAccountTransaction` matches to its payment by
 * quote id.
 */
export const createCashuAccountTransactionSyncJob =
  ({
    recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
  }: CashuAccountTransactionSyncJobOptions = {}): BackgroundJob =>
  (run) => {
    const context: BackgroundJobContext = {
      ...run.deps,
      console: run.deps.console.child("cashu-account-transaction-sync-job"),
    }

    if (context.cashuWallet === null) {
      context.console.info(
        "Skipped cashu account transaction sync: no wallet for this runtime."
      )
      return ok({ [Symbol.asyncDispose]: async () => undefined })
    }

    return ok(
      createCashuAccountSyncManager({
        context,
        wallet: context.cashuWallet,
        recheckIntervalMs,
      })
    )
  }

export const startCashuAccountTransactionSyncJob =
  createCashuAccountTransactionSyncJob()

const createCashuAccountSyncManager = ({
  context,
  wallet,
  recheckIntervalMs,
}: {
  readonly context: BackgroundJobContext
  readonly wallet: NonNullable<BackgroundJobContext["cashuWallet"]>
  readonly recheckIntervalMs: number
}): AsyncDisposable => {
  let accounts: ReadonlyArray<CashuAccountRow> = []
  let disposed = false
  const queue = createKeyedTaskQueue<"refresh" | "watch" | `topup:${string}`>({
    onError: (error) => context.onError(error),
  })

  const accountForReceipt = (
    receipt: CashuTopupReceipt
  ): CashuAccountRow | undefined =>
    accounts.find((account) => account.mintUrl === receipt.mintUrl) ??
    accounts[0]

  const recordTopup = async (
    receipt: CashuTopupReceipt
  ): Promise<RecordTopupResult> => {
    const account = accountForReceipt(receipt)
    if (account === undefined) {
      // The receipt arrived after the account was disabled: leave the record
      // for the next time it is active, when a resume re-reports it.
      context.console.warn("Minted cashu topup has no active account.", {
        mintUrl: receipt.mintUrl,
        quoteId: receipt.quoteId,
      })
      return "duplicate"
    }

    return await context.lockManager.request(
      `cashu-topup-${receipt.mintUrl}-${receipt.quoteId}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock === null) {
          context.console.debug("Skipped locked cashu topup.", {
            accountId: account.id,
            quoteId: receipt.quoteId,
          })
          return "lock-unavailable"
        }

        const quoteId = NonEmptyStringSchema.decode(receipt.quoteId)
        const mintUrl = CashuMintUrlSchema.decode(receipt.mintUrl)
        const existing = await context.evolu.loadQuery(
          accountTransactionCashuByQuoteIdQuery({ mintUrl, quoteId })
        )
        if (existing.length > 0) {
          context.console.debug("Skipped already recorded cashu topup.", {
            accountId: account.id,
            quoteId,
          })
          return "duplicate"
        }

        const run = createRun(context)
        const accountTransactionId = await run.ok(
          createAccountTransaction({
            accountId: account.id,
            amount: IntegerSchema.decode(receipt.amountSats),
            currency: "BTC",
            occurredAt: TimestampMsSchema.decode(context.date.now().getTime()),
            note: null,
            internalTransferGroupId: null,
            source: { deviceId: null, source: "auto" },
            cashu: {
              mintUrl,
              quoteId,
              lnInvoice: NonEmptyStringSchema.decode(receipt.invoice),
            },
          })
        )
        const paymentId = await run.ok(
          reconcileAccountTransaction(accountTransactionId)
        )
        context.console.info("Created cashu account transaction.", {
          accountId: account.id,
          accountTransactionId,
          amount: receipt.amountSats,
          paymentId,
          quoteId,
        })
        return "created"
      }
    )
  }

  const watchPendingTopups = async (): Promise<void> => {
    if (accounts.length === 0) return
    await wallet.watchPendingTopups()
  }

  const watchSoon = (): void => {
    queue.enqueue("watch", watchPendingTopups)
  }

  const refreshAccounts = async (): Promise<void> => {
    const rows = await context.evolu.loadQuery(activeCashuAccountsQuery)
    const hadAccounts = accounts.length > 0
    accounts = rows.map(
      (row): CashuAccountRow => ({ id: row.id, mintUrl: row.mintUrl })
    )

    context.console.debug("Refreshed cashu accounts.", {
      activeAccountCount: accounts.length,
    })

    if (accounts.length > 0 && !hadAccounts) {
      context.console.info("Started cashu account sync.")
    }
    if (accounts.length > 0) watchSoon()
  }

  const refreshSoon = (): void => {
    queue.enqueue("refresh", refreshAccounts)
  }

  const unsubscribeAccounts = context.evolu.subscribeQuery(
    activeCashuAccountsQuery
  )(refreshSoon)
  const unsubscribeSettled = wallet.subscribeTopupSettled((receipt) => {
    context.console.debug("Received minted cashu topup.", {
      mintUrl: receipt.mintUrl,
      quoteId: receipt.quoteId,
    })
    queue.enqueue(`topup:${receipt.mintUrl}|${receipt.quoteId}`, async () => {
      await recordTopup(receipt)
    })
  })
  const recheckTimer = setInterval(watchSoon, recheckIntervalMs)
  ;(recheckTimer as { readonly unref?: () => void }).unref?.()
  // A watcher that gave up while offline is re-created as soon as the
  // browser reports connectivity, instead of at the next interval.
  const onOnline = (): void => {
    context.console.debug("Connectivity returned; rechecking cashu topups.")
    watchSoon()
  }
  globalThis.addEventListener?.("online", onOnline)

  context.console.info("Started cashu account transaction sync job.")
  refreshSoon()

  return {
    async [Symbol.asyncDispose]() {
      if (disposed) return
      disposed = true

      queue[Symbol.dispose]()
      clearInterval(recheckTimer)
      globalThis.removeEventListener?.("online", onOnline)
      unsubscribeAccounts()
      unsubscribeSettled()
      accounts = []
      context.console.info("Stopped cashu account transaction sync job.")
    },
  }
}
