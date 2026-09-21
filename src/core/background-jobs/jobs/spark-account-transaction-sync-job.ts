import type { WalletTransfer } from "@buildonspark/spark-sdk/types"
import { err, ok, type Result, type Run } from "@evolu/common"
import { z } from "zod"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import { reconcileAccountSyncSessions } from "@/core/background-jobs/reconcile-account-sync-sessions.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionSparkByTransferIdQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import type { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IntegerSchema,
  type NonEmptyString,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  createSharedSparkSyncWallet,
  type SharedSparkSyncWallet,
} from "@/core/spark/spark-wallet.ts"

const DEFAULT_RECHECK_INTERVAL_MS = 60_000
const TRANSFER_PAGE_SIZE = 50
const COMPLETED_TRANSFER_STATUS = "TRANSFER_STATUS_COMPLETED"
const OUTGOING_TRANSFER_DIRECTION = "OUTGOING"

interface SparkTransfer {
  readonly id: string
  readonly status: WalletTransfer["status"]
  readonly totalValue: number
  readonly transferDirection: WalletTransfer["transferDirection"]
  readonly updatedTime: Date | undefined
  readonly createdTime: Date | undefined
  readonly lnInvoice?: string | undefined
  readonly sparkInvoice: string | undefined
  readonly userRequest: unknown
}

type SparkWalletFactory = (
  secret: SparkSecret
) => Promise<SharedSparkSyncWallet>

interface SparkAccountTransactionSyncJobOptions {
  readonly walletFactory?: SparkWalletFactory
  readonly recheckIntervalMs?: number
}

interface SparkAccountRow {
  readonly id: AccountId
  readonly secret: SparkSecret
}

interface SparkTransactionDetails {
  readonly lnInvoice: string
  readonly preImage: string
  readonly paymentHash: string
}

interface SparkTransactionPayload {
  readonly details: SparkTransactionDetails
  readonly memo: string
}

type RecordTransferResult =
  | "created"
  | "duplicate"
  | "ignored"
  | "lock-unavailable"

type SparkTransactionInput = Parameters<typeof createAccountTransaction>[0]
type SparkTransactionInputError = "missing-spark-identifier"

export const createSparkAccountTransactionSyncJob =
  ({
    walletFactory = createSharedSparkSyncWallet,
    recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
  }: SparkAccountTransactionSyncJobOptions = {}): BackgroundJob =>
  (run) => {
    // A fresh `run.create()` scope, not the Task's own `run`: that one is
    // disposed the instant this Task function returns, but the sessions
    // below keep composing Tasks (via their stored `run`) for as long as the
    // job itself runs. Explicitly disposed in the returned disposable below —
    // see AGENTS.md and `createRun`'s doc comment on why a detached
    // `createRun` call per transfer (the previous shape here) leaks a root
    // Evolu never gets to dispose.
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("spark-account-transaction-sync-job"),
    })
    const disposer = new AsyncDisposableStack()
    disposer.use(jobRun)
    disposer.use(
      createSparkAccountSyncManager({
        run: jobRun,
        recheckIntervalMs,
        walletFactory,
      })
    )

    return ok(disposer)
  }

export const startSparkAccountTransactionSyncJob =
  createSparkAccountTransactionSyncJob()

const createSparkAccountSyncManager = ({
  run,
  recheckIntervalMs,
  walletFactory,
}: {
  readonly run: Run<BackgroundJobContext>
  readonly recheckIntervalMs: number
  readonly walletFactory: SparkWalletFactory
}): AsyncDisposable => {
  const sessions = new Map<
    AccountId,
    AsyncDisposable & {
      readonly secret: SparkSecret
      syncHistorySoon: () => void
    }
  >()
  const refreshQueue = createKeyedTaskQueue<"refresh">({
    onError: (error) => run.deps.onError(error),
  })

  const refreshAccounts = async (): Promise<void> => {
    const rows = await run.deps.evolu.loadQuery(activeSparkAccountsQuery)
    const accounts = rows.map(
      (row): SparkAccountRow => ({ id: row.id, secret: row.secret })
    )

    run.deps.console.debug("Refreshing Spark account syncs.", {
      activeAccountCount: accounts.length,
      runningAccountCount: sessions.size,
    })

    await reconcileAccountSyncSessions({
      sessions,
      activeAccounts: accounts,
      getKey: (account) => account.id,
      matches: (session, account) => session.secret === account.secret,
      createSession: (account) =>
        createSparkAccountSyncSession({ account, run, walletFactory }),
      disposeSession: (session) => session[Symbol.asyncDispose](),
      onSessionStopped: (accountId) => {
        run.deps.console.info("Stopped Spark account sync.", { accountId })
      },
      onSessionStarted: (accountId, _account, replacedExistingSync) => {
        run.deps.console.info("Started Spark account sync.", {
          accountId,
          replacedExistingSync,
        })
      },
    })
  }

  const refreshSoon = (): void => {
    refreshQueue.enqueue("refresh", refreshAccounts)
  }

  const unsubscribeAccounts = run.deps.evolu.subscribeQuery(
    activeSparkAccountsQuery
  )(refreshSoon)
  const recheckTimer = setInterval(() => {
    run.deps.console.debug("Queueing Spark history sync for all accounts.", {
      runningAccountCount: sessions.size,
    })

    for (const session of sessions.values()) {
      session.syncHistorySoon()
    }
  }, recheckIntervalMs)
  ;(recheckTimer as { readonly unref?: () => void }).unref?.()

  run.deps.console.info("Started Spark account transaction sync job.")
  refreshSoon()

  return {
    async [Symbol.asyncDispose]() {
      if (refreshQueue.isDisposed) return

      refreshQueue[Symbol.dispose]()
      clearInterval(recheckTimer)
      unsubscribeAccounts()

      for (const session of sessions.values()) {
        await session[Symbol.asyncDispose]()
      }
      sessions.clear()
      run.deps.console.info("Stopped Spark account transaction sync job.")
    },
  }
}

const createSparkAccountSyncSession = ({
  account,
  run,
  walletFactory,
}: {
  readonly account: SparkAccountRow
  readonly run: Run<BackgroundJobContext>
  readonly walletFactory: SparkWalletFactory
}): AsyncDisposable & {
  readonly secret: SparkSecret
  syncHistorySoon: () => void
} => {
  let wallet: SharedSparkSyncWallet | undefined
  let unsubscribeEvents: (() => void) | undefined
  let disposed = false
  let isInitializing = false
  let pendingHistorySync = false
  const pendingTransferIds = new Set<string>()
  const queue = createKeyedTaskQueue<"history" | `transfer:${string}`>({
    onError: (error) => run.deps.onError(error),
  })

  const bufferTransferSync = (transferId: string, message: string): void => {
    pendingTransferIds.add(transferId)
    run.deps.console.debug(message, {
      accountId: account.id,
      pendingTransferCount: pendingTransferIds.size,
      sparkTransferId: transferId,
    })
  }

  const queueTransferSync = (transferId: string): void => {
    queue.enqueue(`transfer:${transferId}`, () => syncTransferById(transferId))
  }

  const queueHistorySync = (): void => {
    queue.enqueue("history", syncHistory)
  }

  const bufferHistorySync = (message: string): void => {
    pendingHistorySync = true
    run.deps.console.debug(message, {
      accountId: account.id,
    })
  }

  const recordTransfer = async (
    transfer: SparkTransfer
  ): Promise<RecordTransferResult> => {
    if (!shouldRecordTransfer(transfer)) {
      run.deps.console.debug("Ignored Spark transfer.", {
        accountId: account.id,
        sparkTransferId: transfer.id,
        transfer,
      })
      return "ignored"
    }

    return await run.deps.lockManager.request(
      `spark-transfer-${transfer.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock === null) {
          run.deps.console.debug("Skipped locked Spark transfer.", {
            accountId: account.id,
            sparkTransferId: transfer.id,
          })
          return "lock-unavailable"
        }

        const sparkTransferId = NonEmptyStringSchema.decode(transfer.id)
        const existing = await run.deps.evolu.loadQuery(
          accountTransactionSparkByTransferIdQuery(sparkTransferId)
        )
        const existingAccountTransactionId = existing[0]?.id
        if (existingAccountTransactionId !== undefined) {
          run.deps.console.debug("Skipped already recorded Spark transfer.", {
            accountId: account.id,
            sparkTransferId,
            existingCount: existing.length,
          })
          // A prior sync may have recorded the transaction but crashed or
          // failed before claiming it, and this transfer would then never be
          // downloaded again to give reconciliation another chance —
          // `reconcileAccountTransaction` itself is the guard against
          // redoing work for one already claimed.
          await run.ok(
            reconcileAccountTransaction(existingAccountTransactionId)
          )
          return "duplicate"
        }

        const input = createSparkTransactionInput(
          account.id,
          sparkTransferId,
          transfer,
          run.deps.date.now()
        )
        if (!input.ok) {
          run.deps.console.debug("Ignored incomplete Spark transfer.", {
            accountId: account.id,
            reason: input.error,
            sparkTransferId,
          })
          return "ignored"
        }

        const accountTransactionId = await run.ok(
          createAccountTransaction(input.value)
        )
        const paymentId = await run.ok(
          reconcileAccountTransaction(accountTransactionId)
        )
        run.deps.console.info("Created Spark account transaction.", {
          accountId: account.id,
          accountTransactionId,
          amount: getTransferAmount(transfer),
          paymentId,
          sparkTransferId,
        })
        return "created"
      }
    )
  }

  const syncTransferById = async (transferId: string): Promise<void> => {
    const currentWallet = wallet
    if (currentWallet === undefined) {
      bufferTransferSync(
        transferId,
        "Buffered Spark transfer sync before wallet init."
      )
      return
    }

    const transfer = await currentWallet.getTransfer(transferId)
    if (transfer === undefined) {
      run.deps.console.warn(
        "Spark transfer event referenced an unavailable transfer.",
        {
          accountId: account.id,
          sparkTransferId: transferId,
        }
      )
      queueHistorySync()
      return
    }

    await recordTransfer(transfer)
  }

  const syncHistory = async (): Promise<void> => {
    const currentWallet = wallet
    if (currentWallet === undefined) {
      bufferHistorySync("Buffered Spark history sync before wallet init.")
      return
    }

    let offset = 0
    let pageCount = 0
    let transferCount = 0
    const results: Record<RecordTransferResult, number> = {
      created: 0,
      duplicate: 0,
      ignored: 0,
      "lock-unavailable": 0,
    }

    run.deps.console.info("Started Spark transfer history sync.", {
      accountId: account.id,
      pageSize: TRANSFER_PAGE_SIZE,
    })

    while (!queue.isDisposed) {
      const page = await currentWallet.getTransfers(TRANSFER_PAGE_SIZE, offset)
      pageCount += 1
      transferCount += page.transfers.length

      run.deps.console.debug("Fetched Spark transfer page.", {
        accountId: account.id,
        offset,
        nextOffset: page.offset,
        transferCount: page.transfers.length,
      })

      for (const transfer of page.transfers) {
        const result = await recordTransfer(transfer)
        results[result] += 1
      }

      if (page.transfers.length === 0 || page.offset <= offset) break
      offset = page.offset
    }

    run.deps.console.info("Finished Spark transfer history sync.", {
      accountId: account.id,
      pageCount,
      transferCount,
      createdCount: results.created,
      duplicateCount: results.duplicate,
      ignoredCount: results.ignored,
      lockUnavailableCount: results["lock-unavailable"],
      disposed: queue.isDisposed,
    })
  }

  const syncTransferSoon = (transferId: string): void => {
    if (wallet === undefined) {
      bufferTransferSync(
        transferId,
        "Buffered Spark transfer event before wallet init."
      )
      return
    }

    queueTransferSync(transferId)
  }

  const syncHistorySoon = (): void => {
    if (wallet === undefined) {
      bufferHistorySync("Buffered Spark history event before wallet init.")
      initializeSoon()
      return
    }

    queueHistorySync()
  }

  const flushBufferedWork = (): void => {
    for (const transferId of pendingTransferIds) {
      queueTransferSync(transferId)
    }
    pendingTransferIds.clear()

    if (pendingHistorySync) {
      pendingHistorySync = false
      queueHistorySync()
    }
  }

  const init = async (): Promise<void> => {
    if (disposed || wallet !== undefined || isInitializing) {
      return
    }

    run.deps.console.debug("Initializing Spark wallet.", {
      accountId: account.id,
    })

    isInitializing = true

    try {
      const createdWallet = await walletFactory(account.secret)

      if (disposed) {
        await createdWallet[Symbol.asyncDispose]()
        return
      }

      wallet = createdWallet
      // Uses the SDK's SparkWalletEvent string values directly (verified
      // against its declaration) instead of importing the enum, so this
      // module doesn't pull the Spark SDK's runtime code into the app's
      // main bundle — see spark-wallet.ts's sparkWalletPool comment.
      unsubscribeEvents = createdWallet.subscribe({
        "transfer:claimed": (transferId) => {
          run.deps.console.debug("Received Spark transfer claimed event.", {
            accountId: account.id,
            sparkTransferId: transferId,
          })
          syncTransferSoon(transferId)
        },
        "balance:update": () => {
          run.deps.console.debug("Received Spark balance update event.", {
            accountId: account.id,
          })
          syncHistorySoon()
        },
        "deposit:confirmed": () => {
          run.deps.console.debug("Received Spark deposit confirmed event.", {
            accountId: account.id,
          })
          syncHistorySoon()
        },
      })
      run.deps.console.info("Initialized Spark wallet.", {
        accountId: account.id,
      })
      flushBufferedWork()
      syncHistorySoon()
    } finally {
      isInitializing = false
    }
  }

  const initializeSoon = (): void => {
    void init().catch((error: unknown) => {
      run.deps.onError(error)
    })
  }

  initializeSoon()

  return {
    get secret() {
      return account.secret
    },
    syncHistorySoon,
    async [Symbol.asyncDispose]() {
      if (disposed) return

      disposed = true
      queue[Symbol.dispose]()
      pendingTransferIds.clear()
      pendingHistorySync = false

      unsubscribeEvents?.()
      unsubscribeEvents = undefined

      const walletToCleanup = wallet
      wallet = undefined

      if (walletToCleanup === undefined) {
        run.deps.console.debug("Disposed Spark account sync before init.", {
          accountId: account.id,
        })
        return
      }

      try {
        await walletToCleanup[Symbol.asyncDispose]()
      } catch (error) {
        run.deps.onError(error)
      }
    },
  }
}

const createSparkTransactionInput = (
  accountId: AccountId,
  sparkTransferId: NonEmptyString,
  transfer: SparkTransfer,
  now: Date
): Result<SparkTransactionInput, SparkTransactionInputError> => {
  const payload = getSparkTransactionPayload(transfer.userRequest)
  const lnInvoice = nullableNonEmptyString(
    transfer.lnInvoice ?? payload?.details.lnInvoice
  )
  const sparkInvoice = nullableNonEmptyString(transfer.sparkInvoice)
  if (lnInvoice === null && sparkInvoice === null) {
    return err("missing-spark-identifier")
  }

  return ok({
    accountId,
    amount: IntegerSchema.decode(getTransferAmount(transfer)),
    currency: "BTC" as const,
    occurredAt: TimestampMsSchema.decode(getTransferOccurredAt(transfer, now)),
    note: getTransferNote(payload?.memo ?? ""),
    internalTransferGroupId: null,
    source: {
      deviceId: null,
      source: "auto" as const,
    },
    spark: {
      sparkTransferId,
      lightning:
        lnInvoice === null
          ? undefined
          : {
              lnInvoice,
              preImage: nullableNonEmptyString(payload?.details.preImage),
              paymentHash: nullableNonEmptyString(payload?.details.paymentHash),
            },
      sparkInvoice:
        sparkInvoice === null
          ? undefined
          : {
              sparkInvoice,
            },
    },
  })
}

const shouldRecordTransfer = (transfer: SparkTransfer): boolean =>
  transfer.status === COMPLETED_TRANSFER_STATUS && transfer.totalValue > 0

const getTransferAmount = (transfer: SparkTransfer): number =>
  transfer.transferDirection === OUTGOING_TRANSFER_DIRECTION
    ? -transfer.totalValue
    : transfer.totalValue

const getTransferOccurredAt = (transfer: SparkTransfer, now: Date): number =>
  (transfer.updatedTime ?? transfer.createdTime ?? now).getTime()

const getTransferNote = (memo: string): NonEmptyString | null =>
  memo === "" ? null : NonEmptyStringSchema.decode(memo)

const nullableNonEmptyString = (
  value: string | undefined
): NonEmptyString | null =>
  value === undefined ? null : NonEmptyStringSchema.decode(value)

const UserRequestSchema = z.looseObject({
  paymentPreimage: z.string().min(1),
  invoice: z.object({
    encodedInvoice: z.string().min(1),
    paymentHash: z.string().min(1),
    memo: z.string().nullable().optional(),
  }),
})

const getSparkTransactionPayload = (
  userRequest: unknown
): SparkTransactionPayload | null => {
  const result = UserRequestSchema.safeParse(userRequest)
  if (!result.success) return null

  const { paymentPreimage, invoice } = result.data
  return {
    details: {
      lnInvoice: invoice.encodedInvoice,
      preImage: paymentPreimage,
      paymentHash: invoice.paymentHash,
    },
    memo: invoice.memo ?? "",
  }
}
