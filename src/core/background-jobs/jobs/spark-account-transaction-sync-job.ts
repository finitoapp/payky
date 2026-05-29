import {
  SparkWallet,
  SparkWalletEvent,
  type SparkWalletEvents,
} from "@buildonspark/spark-sdk"
import { type ConsoleDep, createRun } from "@evolu/common"
import { validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"

import type {
  BackgroundJob,
  BackgroundJobOnErrorDep,
} from "@/core/background-jobs/background-job-types.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionSparkByTransferIdQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
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
const transferWriteLocks = new Map<string, Promise<void>>()
const FULL_SYNC_TRIGGER_EVENTS = [
  SparkWalletEvent.BalanceUpdate,
  SparkWalletEvent.DepositConfirmed,
] as const

type SparkWalletEventName =
  | typeof SparkWalletEvent.TransferClaimed
  | typeof SparkWalletEvent.BalanceUpdate
  | typeof SparkWalletEvent.DepositConfirmed

type BackgroundJobDeps = Parameters<BackgroundJob>[0]

type AccountSyncDeps = EvoluDep & ConsoleDep & BackgroundJobOnErrorDep

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
  (context) => {
    const jobContext = {
      ...context,
      console: context.console.child("spark-account-transaction-sync-job"),
    }
    const sync = new SparkAccountTransactionSync(
      jobContext,
      walletFactory,
      recheckIntervalMs
    )

    sync.start()

    return {
      [Symbol.dispose]: () => {
        sync.dispose()
      },
    }
  }

export const startSparkAccountTransactionSyncJob =
  createSparkAccountTransactionSyncJob()

class SparkAccountTransactionSync {
  private readonly accountSyncs = new Map<AccountId, SparkAccountSync>()
  private readonly unsubscribeAccounts: () => void
  private readonly recheckTimer: ReturnType<typeof setInterval>
  private disposed = false
  private refreshRunning = false
  private refreshQueued = false
  private readonly context: BackgroundJobDeps
  private readonly walletFactory: SparkWalletFactory

  constructor(
    context: BackgroundJobDeps,
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
    if (this.disposed) return

    this.disposed = true
    clearInterval(this.recheckTimer)
    this.unsubscribeAccounts()

    for (const sync of this.accountSyncs.values()) {
      sync.dispose()
    }
    this.accountSyncs.clear()
  }

  private queueRefresh(): void {
    if (this.disposed) return

    void this.refreshAccounts().catch((error: unknown) => {
      this.context.onError(error)
    })
  }

  private async refreshAccounts(): Promise<void> {
    if (this.refreshRunning) {
      this.refreshQueued = true
      return
    }

    this.refreshRunning = true

    try {
      do {
        this.refreshQueued = false
        const rows = await this.context.evolu.loadQuery(
          activeSparkAccountsQuery
        )
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
      } while (this.refreshQueued && !this.disposed)
    } finally {
      this.refreshRunning = false
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
  private disposed = false
  private syncRunning = false
  private syncQueued = false
  private readonly deps: AccountSyncDeps
  private readonly walletFactory: SparkWalletFactory
  private readonly account: SparkAccountRow

  constructor(
    deps: AccountSyncDeps,
    walletFactory: SparkWalletFactory,
    account: SparkAccountRow
  ) {
    this.deps = deps
    this.walletFactory = walletFactory
    this.account = account
  }

  get mnemonic(): string {
    return this.account.mnemonic
  }

  start(): void {
    void this.initialize().catch((error: unknown) => {
      this.deps.onError(error)
    })
  }

  dispose(): void {
    if (this.disposed) return

    this.disposed = true

    const wallet = this.wallet
    if (wallet == null) return

    wallet.off(SparkWalletEvent.TransferClaimed, this.handleTransferClaimed)
    for (const event of FULL_SYNC_TRIGGER_EVENTS) {
      wallet.off(event, this.handleSyncTrigger)
    }

    void wallet.cleanup().catch((error: unknown) => {
      this.deps.onError(error)
    })
  }

  queueFullSync(): void {
    if (this.disposed || this.wallet == null) return

    void this.syncTransfers().catch((error: unknown) => {
      this.deps.onError(error)
    })
  }

  private async initialize(): Promise<void> {
    if (!isValidSparkSecret(this.account.mnemonic)) {
      this.deps.console.warn("Skipped Spark account with an invalid secret.", {
        accountId: this.account.id,
      })
      return
    }

    const wallet = await this.walletFactory(this.account.mnemonic)

    if (this.disposed) {
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
      this.deps.onError(error)
    }
  }

  private readonly handleSyncTrigger = () => {
    this.queueFullSync()
  }

  private async syncTransfers(): Promise<void> {
    if (this.syncRunning) {
      this.syncQueued = true
      return
    }

    this.syncRunning = true

    try {
      do {
        this.syncQueued = false

        const wallet = this.wallet
        if (wallet == null) return

        let offset = 0

        while (!this.disposed) {
          const page = await wallet.getTransfers(TRANSFER_PAGE_SIZE, offset)

          for (const transfer of page.transfers) {
            await this.recordTransfer(transfer)
          }

          if (page.transfers.length === 0 || page.offset <= offset) {
            break
          }

          offset = page.offset
        }
      } while (this.syncQueued && !this.disposed)
    } finally {
      this.syncRunning = false
    }
  }

  private async recordTransfer(transfer: SparkTransfer): Promise<void> {
    if (!shouldRecordTransfer(transfer)) return

    const sparkTransferId = NonEmptyStringSchema.decode(transfer.id)
    await runWithTransferWriteLock(sparkTransferId, async () => {
      const existing = await this.deps.evolu.loadQuery(
        accountTransactionSparkByTransferIdQuery(sparkTransferId)
      )
      if (existing.length > 0) return

      const run = createRun(this.deps)
      await run.orThrow(
        createAccountTransaction(
          createSparkTransactionInput(
            this.account.id,
            sparkTransferId,
            transfer
          )
        )
      )
      this.deps.console.info("Created Spark account transaction.", {
        accountId: this.account.id,
        sparkTransferId,
      })
    })
  }
}

const createSparkTransactionInput = (
  accountId: AccountId,
  sparkTransferId: NonEmptyString,
  transfer: SparkTransfer
) => {
  const details = getSparkTransactionDetails(transfer)

  return {
    deviceId: null,
    accountId,
    amount: IntegerSchema.decode(getTransferAmount(transfer)),
    currency: "BTC" as const,
    occurredAt: TimestampMsSchema.decode(getTransferOccurredAt(transfer)),
    note: getTransferNote(transfer),
    internalTransferGroupId: null,
    spark: {
      sparkTransferId,
      lnInvoice: NonEmptyStringSchema.decode(details.lnInvoice),
      preImage: NonEmptyStringSchema.decode(details.preImage),
      paymentHash: NonEmptyStringSchema.decode(details.paymentHash),
    },
  }
}

const runWithTransferWriteLock = async (
  sparkTransferId: string,
  write: () => Promise<void>
): Promise<void> => {
  const previous = transferWriteLocks.get(sparkTransferId) ?? Promise.resolve()
  const current = previous.then(write, write)
  transferWriteLocks.set(sparkTransferId, current)

  try {
    await current
  } finally {
    if (transferWriteLocks.get(sparkTransferId) === current) {
      transferWriteLocks.delete(sparkTransferId)
    }
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

const getLightningDetails = (
  userRequest: unknown
): Partial<SparkTransactionDetails> => {
  if (!isRecord(userRequest)) return {}

  const encodedInvoice = getStringProperty(userRequest, "encodedInvoice")
  const paymentPreimage = getStringProperty(userRequest, "paymentPreimage")
  const invoice = getRecordProperty(userRequest, "invoice")

  return {
    lnInvoice:
      encodedInvoice ??
      getStringProperty(invoice, "encodedInvoice") ??
      undefined,
    preImage: paymentPreimage ?? undefined,
    paymentHash: getStringProperty(invoice, "paymentHash") ?? undefined,
  }
}

const getUserRequestMemo = (userRequest: unknown): string => {
  const invoice = isRecord(userRequest)
    ? getRecordProperty(userRequest, "invoice")
    : undefined
  return getStringProperty(invoice, "memo") ?? ""
}

const getRecordProperty = (
  value: Readonly<Record<string, unknown>> | undefined,
  key: string
): Readonly<Record<string, unknown>> | undefined => {
  const property = value?.[key]
  return isRecord(property) ? property : undefined
}

const getStringProperty = (
  value: Readonly<Record<string, unknown>> | undefined,
  key: string
): string | undefined => {
  const property = value?.[key]
  return typeof property === "string" && property !== "" ? property : undefined
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null

const isValidSparkSecret = (secret: string): boolean =>
  validateMnemonic(secret, wordlist) || HEX_SEED_PATTERN.test(secret)
