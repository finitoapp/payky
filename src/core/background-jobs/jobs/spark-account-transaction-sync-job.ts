import {
  SparkWallet,
  SparkWalletEvent,
  type SparkWalletEvents,
} from "@buildonspark/spark-sdk"
import { createRun, ok } from "@evolu/common"
import { validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
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

const DEFAULT_RECHECK_INTERVAL_MS = 60_000
const TRANSFER_PAGE_SIZE = 50
const COMPLETED_TRANSFER_STATUS = "TRANSFER_STATUS_COMPLETED"
const HEX_SEED_PATTERN = /^(?:[0-9a-fA-F]{2})+$/u
const FULL_SYNC_TRIGGER_EVENTS = [
  SparkWalletEvent.BalanceUpdate,
  SparkWalletEvent.DepositConfirmed,
] as const

type SparkWalletEventName =
  | typeof SparkWalletEvent.TransferClaimed
  | typeof SparkWalletEvent.BalanceUpdate
  | typeof SparkWalletEvent.DepositConfirmed

interface SparkTransfer {
  readonly id: string
  readonly status: string
  readonly totalValue: number
  readonly transferDirection: string
  readonly updatedTime: Date | undefined
  readonly createdTime: Date | undefined
  readonly sparkInvoice: string | undefined
  readonly userRequest: unknown
}

interface SparkWalletLike {
  readonly getTransfers: (
    limit?: number,
    offset?: number,
    createdAfter?: Date,
    createdBefore?: Date
  ) => Promise<{
    readonly transfers: ReadonlyArray<SparkTransfer>
    readonly offset: number
  }>
  readonly getTransfer: (id: string) => Promise<SparkTransfer | undefined>
  readonly on: (
    event: SparkWalletEventName,
    listener: (...args: ReadonlyArray<unknown>) => void
  ) => void
  readonly off: (
    event: SparkWalletEventName,
    listener: (...args: ReadonlyArray<unknown>) => void
  ) => void
  readonly cleanup: () => Promise<void>
}

type SparkWalletFactory = (mnemonic: string) => Promise<SparkWalletLike>

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

const createDefaultSparkWallet: SparkWalletFactory = async (mnemonic) => {
  const { wallet } = await SparkWallet.getOrCreateWallet({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET",
    },
  })

  return {
    getTransfers: (limit, offset, createdAfter, createdBefore) =>
      wallet.getTransfers(limit, offset, createdAfter, createdBefore),
    getTransfer: (id) => wallet.getTransfer(id),
    on: (event, listener) => {
      wallet.on(
        event,
        listener as (
          ...args: Parameters<SparkWalletEvents[typeof event]>
        ) => void
      )
    },
    off: (event, listener) => {
      wallet.off(
        event,
        listener as (
          ...args: Parameters<SparkWalletEvents[typeof event]>
        ) => void
      )
    },
    cleanup: () => wallet.cleanup(),
  }
}

export const createSparkAccountTransactionSyncJob =
  ({
    walletFactory = createDefaultSparkWallet,
    recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
  }: SparkAccountTransactionSyncJobOptions = {}): BackgroundJob =>
  (run) => {
    const context: BackgroundJobContext = {
      ...run.deps,
      console: run.deps.console.child("spark-account-transaction-sync-job"),
    }
    const sync = new SparkAccountTransactionSync(
      context,
      walletFactory,
      recheckIntervalMs
    )

    sync.start()

    return ok({
      [Symbol.dispose]: () => {
        sync.dispose()
      },
    })
  }

export const startSparkAccountTransactionSyncJob =
  createSparkAccountTransactionSyncJob()

class SparkAccountTransactionSync {
  private readonly accountSyncs = new Map<AccountId, SparkAccountSync>()
  private readonly unsubscribeAccounts: () => void
  private readonly recheckTimer: ReturnType<typeof setInterval>
  private readonly context: BackgroundJobContext
  private readonly walletFactory: SparkWalletFactory
  private readonly refreshQueue = createKeyedTaskQueue({
    onError: (error) => this.context.onError(error),
  })

  constructor(
    context: BackgroundJobContext,
    walletFactory: SparkWalletFactory,
    recheckIntervalMs: number
  ) {
    this.context = context
    this.walletFactory = walletFactory
    this.unsubscribeAccounts = context.evolu.subscribeQuery(
      activeSparkAccountsQuery
    )(() => {
      this.queueRefresh()
    })

    this.recheckTimer = setInterval(() => {
      this.syncAllAccounts()
    }, recheckIntervalMs)
    ;(this.recheckTimer as { readonly unref?: () => void }).unref?.()
  }

  start(): void {
    this.queueRefresh()
  }

  dispose(): void {
    if (this.refreshQueue.isDisposed) return

    this.refreshQueue[Symbol.dispose]()
    clearInterval(this.recheckTimer)
    this.unsubscribeAccounts()

    for (const sync of this.accountSyncs.values()) {
      sync.dispose()
    }
    this.accountSyncs.clear()
  }

  private queueRefresh(): void {
    this.refreshQueue.enqueue("refresh", () => this.refreshAccounts())
  }

  private async refreshAccounts(): Promise<void> {
    const rows = await this.context.evolu.loadQuery(activeSparkAccountsQuery)
    const accounts = rows.map(
      (row): SparkAccountRow => ({
        id: row.id,
        mnemonic: row.mnemonic,
      })
    )
    const activeIds = new Set(accounts.map((account) => account.id))

    for (const [accountId, sync] of this.accountSyncs) {
      if (activeIds.has(accountId)) continue

      sync.dispose()
      this.accountSyncs.delete(accountId)
    }

    for (const account of accounts) {
      const current = this.accountSyncs.get(account.id)
      if (current?.mnemonic === account.mnemonic) continue

      current?.dispose()
      const sync = new SparkAccountSync(
        this.context,
        this.walletFactory,
        account
      )
      this.accountSyncs.set(account.id, sync)
      sync.start()
    }
  }

  private syncAllAccounts(): void {
    for (const sync of this.accountSyncs.values()) {
      sync.queueFullSync()
    }
  }
}

class SparkAccountSync {
  private wallet: SparkWalletLike | undefined
  private readonly context: BackgroundJobContext
  private readonly walletFactory: SparkWalletFactory
  private readonly account: SparkAccountRow
  private readonly syncQueue = createKeyedTaskQueue({
    onError: (error) => this.context.onError(error),
  })

  constructor(
    context: BackgroundJobContext,
    walletFactory: SparkWalletFactory,
    account: SparkAccountRow
  ) {
    this.context = context
    this.walletFactory = walletFactory
    this.account = account
  }

  get mnemonic(): string {
    return this.account.mnemonic
  }

  start(): void {
    void this.initialize().catch((error: unknown) => {
      this.context.onError(error)
    })
  }

  dispose(): void {
    if (this.syncQueue.isDisposed) return

    this.syncQueue[Symbol.dispose]()

    const wallet = this.wallet
    if (wallet == null) return

    wallet.off(SparkWalletEvent.TransferClaimed, this.handleTransferClaimed)
    for (const event of FULL_SYNC_TRIGGER_EVENTS) {
      wallet.off(event, this.handleSyncTrigger)
    }

    void wallet.cleanup().catch((error: unknown) => {
      this.context.onError(error)
    })
  }

  queueFullSync(): void {
    if (this.wallet == null) return
    this.syncQueue.enqueue("sync", () => this.syncTransfers())
  }

  private async initialize(): Promise<void> {
    if (!isValidSparkSecret(this.account.mnemonic)) {
      this.context.console.warn(
        "Skipped Spark account with an invalid secret.",
        {
          accountId: this.account.id,
        }
      )
      return
    }

    const wallet = await this.walletFactory(this.account.mnemonic)

    if (this.syncQueue.isDisposed) {
      await wallet.cleanup()
      return
    }

    this.wallet = wallet
    wallet.on(SparkWalletEvent.TransferClaimed, this.handleTransferClaimed)
    for (const event of FULL_SYNC_TRIGGER_EVENTS) {
      wallet.on(event, this.handleSyncTrigger)
    }

    this.queueFullSync()
  }

  private readonly handleTransferClaimed = async (
    ...args: ReadonlyArray<unknown>
  ): Promise<void> => {
    try {
      const transferId = args[0]
      const wallet = this.wallet

      if (typeof transferId !== "string" || wallet == null) {
        this.queueFullSync()
        return
      }

      const transfer = await wallet.getTransfer(transferId)
      if (transfer == null) {
        this.queueFullSync()
        return
      }

      await this.recordTransfer(transfer)
    } catch (error) {
      this.context.onError(error)
    }
  }

  private readonly handleSyncTrigger = () => {
    this.queueFullSync()
  }

  private async syncTransfers(): Promise<void> {
    const wallet = this.wallet
    if (wallet == null) return

    let offset = 0

    while (!this.syncQueue.isDisposed) {
      const page = await wallet.getTransfers(TRANSFER_PAGE_SIZE, offset)

      for (const transfer of page.transfers) {
        await this.recordTransfer(transfer)
      }

      if (page.transfers.length === 0 || page.offset <= offset) {
        break
      }

      offset = page.offset
    }
  }

  private async recordTransfer(transfer: SparkTransfer): Promise<void> {
    if (!shouldRecordTransfer(transfer)) return

    await navigator.locks.request(
      `spark-transfer-${transfer.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock == null) return

        const sparkTransferId = NonEmptyStringSchema.decode(transfer.id)

        const existing = await this.context.evolu.loadQuery(
          accountTransactionSparkByTransferIdQuery(sparkTransferId)
        )
        if (existing.length > 0) return

        const run = createRun(this.context)
        const accountTransactionId = await run.orThrow(
          createAccountTransaction(
            createSparkTransactionInput(
              this.account.id,
              sparkTransferId,
              transfer
            )
          )
        )
        await run.orThrow(reconcileAccountTransaction(accountTransactionId))
        this.context.console.info("Created Spark account transaction.", {
          accountId: this.account.id,
          sparkTransferId,
        })
      }
    )
  }
}

const createSparkTransactionInput = (
  accountId: AccountId,
  sparkTransferId: NonEmptyString,
  transfer: SparkTransfer
) => {
  const details = getSparkTransactionDetails(transfer)

  return {
    accountId,
    amount: IntegerSchema.decode(getTransferAmount(transfer)),
    currency: "BTC" as const,
    occurredAt: TimestampMsSchema.decode(getTransferOccurredAt(transfer)),
    note: getTransferNote(transfer),
    internalTransferGroupId: null,
    source: {
      deviceId: null,
      source: "automaticScript" as const,
    },
    spark: {
      sparkTransferId,
      lnInvoice: NonEmptyStringSchema.decode(details.lnInvoice),
      preImage: NonEmptyStringSchema.decode(details.preImage),
      paymentHash: NonEmptyStringSchema.decode(details.paymentHash),
    },
  }
}

const shouldRecordTransfer = (transfer: SparkTransfer): boolean =>
  transfer.status === COMPLETED_TRANSFER_STATUS && transfer.totalValue > 0

const getTransferAmount = (transfer: SparkTransfer): number =>
  transfer.transferDirection === "OUTGOING"
    ? -transfer.totalValue
    : transfer.totalValue

const getTransferOccurredAt = (transfer: SparkTransfer): number =>
  (transfer.updatedTime ?? transfer.createdTime ?? new Date()).getTime()

const getTransferNote = (transfer: SparkTransfer) => {
  const note = getUserRequestMemo(transfer.userRequest)
  return note === "" ? null : NonEmptyStringSchema.decode(note)
}

const getSparkTransactionDetails = (
  transfer: SparkTransfer
): SparkTransactionDetails => {
  const lightning = getLightningDetails(transfer.userRequest)
  const fallback = transfer.sparkInvoice ?? transfer.id

  return {
    lnInvoice: lightning.lnInvoice ?? fallback,
    preImage: lightning.preImage ?? transfer.id,
    paymentHash: lightning.paymentHash ?? transfer.id,
  }
}

const UserRequestSchema = z.looseObject({
  encodedInvoice: z.string().min(1).optional(),
  paymentPreimage: z.string().min(1).optional(),
  invoice: z
    .object({
      encodedInvoice: z.string().min(1).optional(),
      paymentHash: z.string().min(1).optional(),
      memo: z.string().optional(),
    })
    .optional(),
})

const getLightningDetails = (
  userRequest: unknown
): Partial<SparkTransactionDetails> => {
  const result = UserRequestSchema.safeParse(userRequest)
  if (!result.success) return {}

  const { encodedInvoice, paymentPreimage, invoice } = result.data
  return {
    lnInvoice: encodedInvoice ?? invoice?.encodedInvoice,
    preImage: paymentPreimage,
    paymentHash: invoice?.paymentHash,
  }
}

const getUserRequestMemo = (userRequest: unknown): string => {
  const result = UserRequestSchema.safeParse(userRequest)
  if (!result.success) return ""
  return result.data.invoice?.memo ?? ""
}

const isValidSparkSecret = (secret: string): boolean =>
  validateMnemonic(secret, wordlist) || HEX_SEED_PATTERN.test(secret)
