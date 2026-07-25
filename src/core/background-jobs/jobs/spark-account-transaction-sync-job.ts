import { SparkWalletEvent } from "@buildonspark/spark-sdk"
import { createRun, err, ok, type Result } from "@evolu/common"
import { validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { z } from "zod"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionSparkByTransferIdQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
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
const HEX_SEED_PATTERN = /^(?:[0-9a-fA-F]{2})+$/u

interface SparkTransfer {
  readonly id: string
  readonly status: string
  readonly totalValue: number
  readonly transferDirection: string
  readonly updatedTime: Date | undefined
  readonly createdTime: Date | undefined
  readonly lnInvoice?: string | undefined
  readonly sparkInvoice: string | undefined
  readonly userRequest: unknown
}

type SparkWalletFactory = (mnemonic: string) => Promise<SharedSparkSyncWallet>

interface SparkAccountTransactionSyncJobOptions {
  readonly walletFactory?: SparkWalletFactory
  readonly recheckIntervalMs?: number
}

interface SparkAccountRow {
  readonly id: AccountId
  readonly mnemonic: string
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
    const context: BackgroundJobContext = {
      ...run.deps,
      console: run.deps.console.child("spark-account-transaction-sync-job"),
    }
    const manager = createSparkAccountSyncManager({
      context,
      recheckIntervalMs,
      walletFactory,
    })

    return ok(manager)
  }

export const startSparkAccountTransactionSyncJob =
  createSparkAccountTransactionSyncJob()

const createSparkAccountSyncManager = ({
  context,
  recheckIntervalMs,
  walletFactory,
}: {
  readonly context: BackgroundJobContext
  readonly recheckIntervalMs: number
  readonly walletFactory: SparkWalletFactory
}): AsyncDisposable => {
  const sessions = new Map<
    AccountId,
    AsyncDisposable & { readonly mnemonic: string; syncHistorySoon: () => void }
  >()
  const refreshQueue = createKeyedTaskQueue({
    onError: (error) => context.onError(error),
  })

  const refreshAccounts = async (): Promise<void> => {
    const rows = await context.evolu.loadQuery(activeSparkAccountsQuery)
    const accounts = rows.map(
      (row): SparkAccountRow => ({ id: row.id, mnemonic: row.mnemonic })
    )
    const activeIds = new Set(accounts.map((account) => account.id))

    context.console.debug("Refreshing Spark account syncs.", {
      activeAccountCount: accounts.length,
      runningAccountCount: sessions.size,
    })

    for (const [accountId, session] of sessions) {
      if (activeIds.has(accountId)) continue

      await session[Symbol.asyncDispose]()
      sessions.delete(accountId)
      context.console.info("Stopped Spark account sync.", { accountId })
    }

    for (const account of accounts) {
      const current = sessions.get(account.id)
      if (current?.mnemonic === account.mnemonic) continue

      await current?.[Symbol.asyncDispose]()
      const session = createSparkAccountSyncSession({
        account,
        context,
        walletFactory,
      })
      sessions.set(account.id, session)
      context.console.info("Started Spark account sync.", {
        accountId: account.id,
        replacedExistingSync: current !== undefined,
      })
    }
  }

  const refreshSoon = (): void => {
    refreshQueue.enqueue("refresh", refreshAccounts)
  }

  const unsubscribeAccounts = context.evolu.subscribeQuery(
    activeSparkAccountsQuery
  )(refreshSoon)
  const recheckTimer = setInterval(() => {
    context.console.debug("Queueing Spark history sync for all accounts.", {
      runningAccountCount: sessions.size,
    })

    for (const session of sessions.values()) {
      session.syncHistorySoon()
    }
  }, recheckIntervalMs)
  ;(recheckTimer as { readonly unref?: () => void }).unref?.()

  context.console.info("Started Spark account transaction sync job.")
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
      context.console.info("Stopped Spark account transaction sync job.")
    },
  }
}

const createSparkAccountSyncSession = ({
  account,
  context,
  walletFactory,
}: {
  readonly account: SparkAccountRow
  readonly context: BackgroundJobContext
  readonly walletFactory: SparkWalletFactory
}): AsyncDisposable & {
  readonly mnemonic: string
  syncHistorySoon: () => void
} => {
  let wallet: SharedSparkSyncWallet | undefined
  let unsubscribeEvents: (() => void) | undefined
  let disposed = false
  let pendingHistorySync = false
  const pendingTransferIds = new Set<string>()
  const queue = createKeyedTaskQueue({
    onError: (error) => context.onError(error),
  })

  const bufferTransferSync = (transferId: string, message: string): void => {
    pendingTransferIds.add(transferId)
    context.console.debug(message, {
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
    context.console.debug(message, {
      accountId: account.id,
    })
  }

  const recordTransfer = async (
    transfer: SparkTransfer
  ): Promise<RecordTransferResult> => {
    if (!shouldRecordTransfer(transfer)) {
      context.console.debug("Ignored Spark transfer.", {
        accountId: account.id,
        sparkTransferId: transfer.id,
        transfer,
      })
      return "ignored"
    }

    return await context.lockManager.request(
      `spark-transfer-${transfer.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock === null) {
          context.console.debug("Skipped locked Spark transfer.", {
            accountId: account.id,
            sparkTransferId: transfer.id,
          })
          return "lock-unavailable"
        }

        const sparkTransferId = NonEmptyStringSchema.decode(transfer.id)
        const existing = await context.evolu.loadQuery(
          accountTransactionSparkByTransferIdQuery(sparkTransferId)
        )
        if (existing.length > 0) {
          context.console.debug("Skipped already recorded Spark transfer.", {
            accountId: account.id,
            sparkTransferId,
            existingCount: existing.length,
          })
          return "duplicate"
        }

        const input = createSparkTransactionInput(
          account.id,
          sparkTransferId,
          transfer,
          context.date.now()
        )
        if (!input.ok) {
          context.console.debug("Ignored incomplete Spark transfer.", {
            accountId: account.id,
            reason: input.error,
            sparkTransferId,
          })
          return "ignored"
        }

        const run = createRun(context)
        const accountTransactionId = await run.orThrow(
          createAccountTransaction(input.value)
        )
        const paymentId = await run.orThrow(
          reconcileAccountTransaction(accountTransactionId)
        )
        context.console.info("Created Spark account transaction.", {
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
      context.console.warn(
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

    context.console.info("Started Spark transfer history sync.", {
      accountId: account.id,
      pageSize: TRANSFER_PAGE_SIZE,
    })

    while (!queue.isDisposed) {
      const page = await currentWallet.getTransfers(TRANSFER_PAGE_SIZE, offset)
      pageCount += 1
      transferCount += page.transfers.length

      context.console.debug("Fetched Spark transfer page.", {
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

    context.console.info("Finished Spark transfer history sync.", {
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
    context.console.debug("Initializing Spark wallet.", {
      accountId: account.id,
    })

    if (!isValidSparkSecret(account.mnemonic)) {
      context.console.warn("Skipped Spark account with an invalid secret.", {
        accountId: account.id,
      })
      return
    }

    const createdWallet = await walletFactory(account.mnemonic)

    if (disposed) {
      await createdWallet[Symbol.asyncDispose]()
      return
    }

    wallet = createdWallet
    unsubscribeEvents = createdWallet.subscribe({
      [SparkWalletEvent.TransferClaimed]: (transferId) => {
        context.console.debug("Received Spark transfer claimed event.", {
          accountId: account.id,
          sparkTransferId: transferId,
        })
        syncTransferSoon(transferId)
      },
      [SparkWalletEvent.BalanceUpdate]: () => {
        context.console.debug("Received Spark balance update event.", {
          accountId: account.id,
        })
        syncHistorySoon()
      },
      [SparkWalletEvent.DepositConfirmed]: () => {
        context.console.debug("Received Spark deposit confirmed event.", {
          accountId: account.id,
        })
        syncHistorySoon()
      },
    })
    context.console.info("Initialized Spark wallet.", { accountId: account.id })
    flushBufferedWork()
    syncHistorySoon()
  }

  void init().catch((error: unknown) => {
    context.onError(error)
  })

  return {
    get mnemonic() {
      return account.mnemonic
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
        context.console.debug("Disposed Spark account sync before init.", {
          accountId: account.id,
        })
        return
      }

      try {
        await walletToCleanup[Symbol.asyncDispose]()
      } catch (error) {
        context.onError(error)
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

const isValidSparkSecret = (secret: string): boolean =>
  validateMnemonic(secret, wordlist) || HEX_SEED_PATTERN.test(secret)
