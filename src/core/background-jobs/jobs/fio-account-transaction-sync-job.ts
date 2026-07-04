import { createRun, ok } from "@evolu/common"
import { format, subDays, subMonths } from "date-fns"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import type { DateDep, FetchDep } from "@/core/deps.ts"
import {
  createFioApiDep,
  type FioTransaction,
  fetchFioTransactionsByPeriod,
} from "@/core/integrations/fio/fio-client.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { defaultFioPluginSyncLookbackDays } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import {
  activeFioPluginsQuery,
  existingFioTransactionBankReferencesQuery,
  fioPluginSyncPointerByPluginIdQuery,
} from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  type DateString,
  DateStringSchema,
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"

type Context = BackgroundJobContext & FetchDep & DateDep

const FIO_FIRST_SYNC_LOOKBACK_MONTHS = 2

const loadActiveFioPlugins = (context: Context) =>
  context.evolu.loadQuery(activeFioPluginsQuery)

type ActiveFioPlugin = Awaited<ReturnType<typeof loadActiveFioPlugins>>[number]
type FioPluginToken = ActiveFioPlugin["tokens"][number]
type ActiveFioPluginWithTokens = ActiveFioPlugin & {
  readonly tokens: readonly [FioPluginToken, ...FioPluginToken[]]
}

export const createFioAccountTransactionSyncJob =
  (): BackgroundJob => (run) => {
    const context: Context = {
      ...run.deps,
      console: run.deps.console.child("fio-account-transaction-sync-job"),
    }
    const sync = new FioAccountTransactionSync(context)

    sync.start()

    return ok({
      [Symbol.asyncDispose]: async () => {
        sync.dispose()
      },
    })
  }

export const startFioAccountTransactionSyncJob =
  createFioAccountTransactionSyncJob()

class FioAccountTransactionSync {
  private readonly pluginSyncs = new Map<FioPluginId, FioPluginSync>()
  private readonly unsubscribePlugins: () => void
  private readonly context: Context
  private readonly refreshQueue = createKeyedTaskQueue({
    onError: (error) => this.context.onError(error),
  })

  constructor(context: Context) {
    this.context = context
    this.unsubscribePlugins = context.evolu.subscribeQuery(
      activeFioPluginsQuery
    )(() => {
      this.queueRefresh()
    })
  }

  start(): void {
    this.context.console.info("Started FIO account transaction sync job.")
    this.queueRefresh()
  }

  dispose(): void {
    if (this.refreshQueue.isDisposed) return

    this.refreshQueue[Symbol.dispose]()
    this.unsubscribePlugins()

    for (const sync of this.pluginSyncs.values()) {
      sync.dispose()
    }
    this.pluginSyncs.clear()
    this.context.console.info("Stopped FIO account transaction sync job.")
  }

  private queueRefresh(): void {
    this.refreshQueue.enqueue("refresh", () => this.refreshPlugins())
  }

  private async refreshPlugins(): Promise<void> {
    const plugins = await loadActiveFioPlugins(this.context)
    const activePlugins = plugins.filter(hasFioTokens)
    const activeIds = new Set(activePlugins.map((plugin) => plugin.id))

    this.context.console.debug("Refreshing FIO plugin syncs.", {
      activePluginCount: activePlugins.length,
      pluginCount: plugins.length,
      runningPluginCount: this.pluginSyncs.size,
      skippedPluginWithoutTokenCount: plugins.length - activePlugins.length,
    })

    for (const [pluginId, sync] of this.pluginSyncs) {
      if (activeIds.has(pluginId)) continue

      sync.dispose()
      this.pluginSyncs.delete(pluginId)
      this.context.console.info("Stopped FIO plugin sync.", {
        pluginId,
      })
    }

    for (const plugin of activePlugins) {
      const current = this.pluginSyncs.get(plugin.id)
      if (current?.matches(plugin) === true) continue

      current?.dispose()
      const sync = new FioPluginSync(this.context, plugin)
      this.pluginSyncs.set(plugin.id, sync)
      this.context.console.info("Started FIO plugin sync.", {
        accountId: plugin.accountId,
        pluginId: plugin.id,
        replacedExistingSync: current != null,
        tokenCount: plugin.tokens.length,
      })
      sync.start()
    }
  }
}

class FioPluginSync {
  private readonly timer: ReturnType<typeof setInterval>
  private readonly context: Context
  private readonly plugin: ActiveFioPluginWithTokens
  private tokenIndex = 0
  private readonly syncQueue = createKeyedTaskQueue({
    onError: (error) => this.context.onError(error),
  })

  constructor(context: Context, plugin: ActiveFioPluginWithTokens) {
    this.context = context
    this.plugin = plugin
    this.timer = setInterval(() => {
      this.queueSync()
    }, plugin.numberOfSecondsBetweenChecks * 1000)
    ;(this.timer as { readonly unref?: () => void }).unref?.()
  }

  start(): void {
    this.queueSync()
  }

  dispose(): void {
    if (this.syncQueue.isDisposed) return

    this.syncQueue[Symbol.dispose]()
    clearInterval(this.timer)
  }

  matches(plugin: ActiveFioPlugin): boolean {
    return (
      this.plugin.accountId === plugin.accountId &&
      this.plugin.numberOfSecondsBetweenChecks ===
        plugin.numberOfSecondsBetweenChecks &&
      this.plugin.syncLookbackDays === plugin.syncLookbackDays &&
      this.plugin.iban === plugin.iban &&
      areTokensEqual(this.plugin.tokens, plugin.tokens)
    )
  }

  private queueSync(): void {
    this.syncQueue.enqueue("sync", () => this.syncTransactions())
  }

  private async syncTransactions(): Promise<void> {
    const token = this.getNextToken()
    const run = createRun({
      ...this.context,
      ...createFioApiDep({
        tokens: [token.token],
      }),
    })
    const period = await this.getSyncPeriod()
    this.context.console.info("Started FIO transaction sync.", {
      accountId: this.plugin.accountId,
      from: period.from,
      pluginId: this.plugin.id,
      to: period.to,
      tokenCount: this.plugin.tokens.length,
    })
    const result = await run(fetchFioTransactionsByPeriod(period))
    if (!result.ok && result.error.type === "FioRateLimitError") {
      this.context.console.error("Skipped FIO sync because of rate limiting.", {
        accountId: this.plugin.accountId,
        pluginId: this.plugin.id,
        responseBody: result.error.responseBody,
      })
      return
    }
    if (!result.ok) throw result.error
    if (result.value.iban !== this.plugin.iban) {
      this.context.console.warn("Skipped FIO statement for a different IBAN.", {
        accountId: this.plugin.accountId,
        expectedIban: this.plugin.iban,
        receivedIban: result.value.iban,
        pluginId: this.plugin.id,
      })
      return
    }

    const transactionsToRecord = await this.getTransactionsToRecord(
      result.value.transactions
    )
    this.context.console.info("Selected FIO transactions to record.", {
      accountId: this.plugin.accountId,
      downloadedCount: result.value.transactions.length,
      pluginId: this.plugin.id,
      selectedCount: transactionsToRecord.length,
      skippedCount:
        result.value.transactions.length - transactionsToRecord.length,
    })
    for (const transaction of transactionsToRecord) {
      if (this.syncQueue.isDisposed) return
      await this.recordTransaction(transaction)
    }
    await this.saveSyncPointer(period.to)
    this.context.console.info("Finished FIO transaction sync.", {
      accountId: this.plugin.accountId,
      from: period.from,
      pluginId: this.plugin.id,
      recordedCount: transactionsToRecord.length,
      to: period.to,
    })
  }

  private getNextToken(): FioPluginToken {
    const token = this.plugin.tokens[this.tokenIndex] ?? this.plugin.tokens[0]
    this.tokenIndex =
      this.tokenIndex + 1 >= this.plugin.tokens.length ? 0 : this.tokenIndex + 1

    return token
  }

  private async recordTransaction(transaction: FioTransaction): Promise<void> {
    await this.context.lockManager.request(
      `fio-transaction-${this.plugin.accountId}-${transaction.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock == null) {
          this.context.console.debug("Skipped locked FIO transaction.", {
            accountId: this.plugin.accountId,
            bankReference: transaction.id,
            pluginId: this.plugin.id,
          })
          return
        }

        const bankReference = NonEmptyString255Schema.decode(transaction.id)

        const run = createRun(this.context)
        const accountTransactionId = await run.orThrow(
          createAccountTransaction({
            accountId: this.plugin.accountId,
            amount: IntegerSchema.decode(transaction.amountMinor),
            currency: transaction.currency,
            occurredAt: TimestampMsSchema.decode(
              Date.parse(`${transaction.bookedDate}T00:00:00.000Z`)
            ),
            note: createTransactionNote(transaction),
            internalTransferGroupId: null,
            source: {
              deviceId: null,
              source: "auto",
            },
            iban: {
              variableSymbol: transaction.variableSymbol,
              constantSymbol: transaction.constantSymbol,
              specificSymbol: transaction.specificSymbol,
              bankReference,
            },
          })
        )
        this.context.console.debug("Reconciling FIO account transaction.", {
          accountId: this.plugin.accountId,
          accountTransactionId,
          bankReference,
          pluginId: this.plugin.id,
        })
        const paymentId = await run.orThrow(
          reconcileAccountTransaction(accountTransactionId)
        )
        this.context.console.info("Created FIO account transaction.", {
          accountId: this.plugin.accountId,
          accountTransactionId,
          amount: transaction.amountMinor,
          bankReference,
          paymentId,
          pluginId: this.plugin.id,
        })
      }
    )
  }

  private async getSyncPeriod(): Promise<{
    readonly from: DateString
    readonly to: DateString
  }> {
    const to = dateToDateString(this.context.date.now())
    const [pointer] = await this.context.evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(this.plugin.id)
    )
    const syncLookbackDays =
      this.plugin.syncLookbackDays ?? defaultFioPluginSyncLookbackDays
    const from =
      pointer?.lastSyncedDate == null
        ? getFioFirstSyncDate(this.context.date.now())
        : dateToDateString(
            subDays(dateStringToDate(pointer.lastSyncedDate), syncLookbackDays)
          )

    this.context.console.debug("Resolved FIO sync period.", {
      from,
      lastSyncedDate: pointer?.lastSyncedDate ?? null,
      pluginId: this.plugin.id,
      syncLookbackDays,
      to,
    })

    return { from, to }
  }

  private async getTransactionsToRecord(
    transactions: ReadonlyArray<FioTransaction>
  ): Promise<ReadonlyArray<FioTransaction>> {
    const bankReferences = getUniqueBankReferences(transactions)
    if (bankReferences.length === 0) {
      this.context.console.debug("No FIO transactions have bank references.", {
        accountId: this.plugin.accountId,
        pluginId: this.plugin.id,
        transactionCount: transactions.length,
      })
      return []
    }

    const existing = await this.context.evolu.loadQuery(
      existingFioTransactionBankReferencesQuery({
        accountId: this.plugin.accountId,
        bankReferences,
      })
    )
    const existingBankReferences = new Set(
      existing.map((transaction) => transaction.bankReference)
    )
    const selectedBankReferences = new Set<string>()
    const selectedTransactions: FioTransaction[] = []

    for (const transaction of transactions) {
      const bankReference = NonEmptyString255Schema.decode(transaction.id)
      if (existingBankReferences.has(bankReference)) continue
      if (selectedBankReferences.has(bankReference)) continue

      selectedBankReferences.add(bankReference)
      selectedTransactions.push(transaction)
    }

    this.context.console.debug("Filtered FIO transactions.", {
      accountId: this.plugin.accountId,
      downloadedCount: transactions.length,
      existingCount: existingBankReferences.size,
      pluginId: this.plugin.id,
      selectedCount: selectedTransactions.length,
      uniqueBankReferenceCount: bankReferences.length,
    })

    return selectedTransactions
  }

  private async saveSyncPointer(lastSyncedDate: DateString): Promise<void> {
    await runMutationWithCompletion((options) =>
      this.context.evolu.upsert(
        "fioPluginSyncPointer",
        removeUndefinedValues({
          id: this.plugin.id,
          lastSyncedDate,
        }),
        { ...options, ownerId: this.context.evoluOwnerId }
      )
    )
    this.context.console.debug("Saved FIO sync pointer.", {
      lastSyncedDate,
      pluginId: this.plugin.id,
    })
  }
}

const getFioFirstSyncDate = (now: Date): DateString => {
  return DateStringSchema.decode(
    format(subMonths(now, FIO_FIRST_SYNC_LOOKBACK_MONTHS), "yyyy-MM-dd")
  )
}

const dateToDateString = (date: Date): DateString =>
  DateStringSchema.decode(format(date, "yyyy-MM-dd"))

const dateStringToDate = (date: DateString): Date =>
  new Date(`${date}T00:00:00.000Z`)

const getUniqueBankReferences = (
  transactions: ReadonlyArray<FioTransaction>
): ReadonlyArray<ReturnType<typeof NonEmptyString255Schema.decode>> => [
  ...new Set(
    transactions.map((transaction) =>
      NonEmptyString255Schema.decode(transaction.id)
    )
  ),
]

const hasFioTokens = (
  plugin: ActiveFioPlugin
): plugin is ActiveFioPluginWithTokens => plugin.tokens.length > 0

const areTokensEqual = (
  left: ReadonlyArray<FioPluginToken>,
  right: ReadonlyArray<FioPluginToken>
): boolean =>
  left.length === right.length &&
  left.every((token, index) => token.token === right[index]?.token)

const createTransactionNote = (transaction: FioTransaction) => {
  const parts = [
    transaction.counterAccountName,
    transaction.recipientMessage,
    transaction.userIdentification,
    transaction.type,
  ].filter((part): part is string => part != null && part.length > 0)

  if (parts.length === 0) return null

  return NonEmptyStringSchema.decode(parts.join(" | "))
}
