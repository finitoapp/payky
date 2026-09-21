import { ok, type Run } from "@evolu/common"
import { format, parseISO, subDays, subMonths } from "date-fns"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import { reconcileAccountSyncSessions } from "@/core/background-jobs/reconcile-account-sync-sessions.ts"
import type { DateDep, FetchDep } from "@/core/deps.ts"
import {
  createFioApiDep,
  type FioApiDep,
  type FioTransaction,
  fetchFioTransactionsByPeriod,
} from "@/core/integrations/fio/fio-client.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { defaultFioPluginSyncLookbackDays } from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import {
  activeFioPluginsQuery,
  existingFioTransactionBankReferencesQuery,
  fioPluginSyncPointerByPluginIdQuery,
} from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { reconcileAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import {
  type DateString,
  DateStringSchema,
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

type Context = BackgroundJobContext & FetchDep & DateDep

const FIO_FIRST_SYNC_LOOKBACK_MONTHS = 2

const loadActiveFioPlugins = (deps: Context) =>
  deps.evolu.loadQuery(activeFioPluginsQuery)

type ActiveFioPlugin = Awaited<ReturnType<typeof loadActiveFioPlugins>>[number]
type FioPluginToken = ActiveFioPlugin["tokens"][number]
type ActiveFioPluginWithTokens = ActiveFioPlugin & {
  readonly tokens: readonly [FioPluginToken, ...FioPluginToken[]]
}

export const createFioAccountTransactionSyncJob =
  (): BackgroundJob => (run) => {
    // A fresh `run.create()` scope, not the Task's own `run`: that one is
    // disposed the instant this Task function returns, but the sync classes
    // below keep composing Tasks (via their stored `run`) for as long as the
    // job itself runs. Explicitly disposed in the returned disposable below —
    // see AGENTS.md and `createRun`'s doc comment on why a detached
    // `createRun` call per transaction (the previous shape here) leaks a root
    // Evolu never gets to dispose.
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("fio-account-transaction-sync-job"),
    })
    const sync = new FioAccountTransactionSync(jobRun)

    sync.start()

    const disposer = new AsyncDisposableStack()
    disposer.use(jobRun)
    disposer.defer(() => sync.dispose())

    return ok(disposer)
  }

export const startFioAccountTransactionSyncJob =
  createFioAccountTransactionSyncJob()

class FioAccountTransactionSync {
  private readonly pluginSyncs = new Map<FioPluginId, FioPluginSync>()
  private readonly unsubscribePlugins: () => void
  private readonly run: Run<Context>
  private readonly refreshQueue = createKeyedTaskQueue<"refresh">({
    onError: (error) => this.run.deps.onError(error),
  })

  constructor(run: Run<Context>) {
    this.run = run
    this.unsubscribePlugins = run.deps.evolu.subscribeQuery(
      activeFioPluginsQuery
    )(() => {
      this.queueRefresh()
    })
  }

  start(): void {
    this.run.deps.console.info("Started FIO account transaction sync job.")
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
    this.run.deps.console.info("Stopped FIO account transaction sync job.")
  }

  private queueRefresh(): void {
    this.refreshQueue.enqueue("refresh", () => this.refreshPlugins())
  }

  private async refreshPlugins(): Promise<void> {
    const plugins = await loadActiveFioPlugins(this.run.deps)
    const activePlugins = plugins.filter(hasFioTokens)

    this.run.deps.console.debug("Refreshing FIO plugin syncs.", {
      activePluginCount: activePlugins.length,
      pluginCount: plugins.length,
      runningPluginCount: this.pluginSyncs.size,
      skippedPluginWithoutTokenCount: plugins.length - activePlugins.length,
    })

    await reconcileAccountSyncSessions({
      sessions: this.pluginSyncs,
      activeAccounts: activePlugins,
      getKey: (plugin) => plugin.id,
      matches: (sync, plugin) => sync.matches(plugin),
      createSession: (plugin) => {
        const sync = new FioPluginSync(this.run, plugin)
        sync.start()
        return sync
      },
      disposeSession: (sync) => sync.dispose(),
      onSessionStopped: (pluginId) => {
        this.run.deps.console.info("Stopped FIO plugin sync.", { pluginId })
      },
      onSessionStarted: (pluginId, plugin, replacedExistingSync) => {
        this.run.deps.console.info("Started FIO plugin sync.", {
          accountId: plugin.accountId,
          pluginId,
          replacedExistingSync,
          tokenCount: plugin.tokens.length,
        })
      },
    })
  }
}

class FioPluginSync {
  private readonly timer: ReturnType<typeof setInterval>
  private readonly run: Run<Context>
  private readonly plugin: ActiveFioPluginWithTokens
  private readonly fioApiDep: FioApiDep
  private readonly syncQueue = createKeyedTaskQueue<"sync">({
    onError: (error) => this.run.deps.onError(error),
  })

  constructor(run: Run<Context>, plugin: ActiveFioPluginWithTokens) {
    this.run = run
    this.plugin = plugin
    // The dep lives as long as this sync session, and `matches()` restarts
    // the session whenever the token set changes, so the client-side
    // `getToken` rotation always covers the current tokens.
    const [firstToken, ...restTokens] = plugin.tokens
    this.fioApiDep = createFioApiDep({
      tokens: [firstToken.token, ...restTokens.map((token) => token.token)],
    })
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
    const period = await this.getSyncPeriod()
    this.run.deps.console.info("Started FIO transaction sync.", {
      accountId: this.plugin.accountId,
      from: period.from,
      pluginId: this.plugin.id,
      to: period.to,
      tokenCount: this.plugin.tokens.length,
    })
    // Custom deps replace a Run's inherited ones rather than merging with
    // them (see `createRun`'s doc comment), so the fetch's extra `FioApiDep`
    // is layered on top of every dep this session's `run` already carries,
    // not passed alone.
    const result = await this.run(fetchFioTransactionsByPeriod(period), {
      ...this.run.deps,
      ...this.fioApiDep,
    })
    if (!result.ok && result.error.type === "FioRateLimitError") {
      this.run.deps.console.error(
        "Skipped FIO sync because of rate limiting.",
        {
          accountId: this.plugin.accountId,
          pluginId: this.plugin.id,
          responseBody: result.error.responseBody,
        }
      )
      return
    }
    if (!result.ok) throw result.error
    if (result.value.iban !== this.plugin.iban) {
      this.run.deps.console.warn(
        "Skipped FIO statement for a different IBAN.",
        {
          accountId: this.plugin.accountId,
          expectedIban: this.plugin.iban,
          receivedIban: result.value.iban,
          pluginId: this.plugin.id,
        }
      )
      return
    }

    const { toRecord, toReconcile } = await this.getTransactionsToRecord(
      result.value.transactions
    )
    this.run.deps.console.info("Selected FIO transactions to record.", {
      accountId: this.plugin.accountId,
      downloadedCount: result.value.transactions.length,
      pluginId: this.plugin.id,
      selectedCount: toRecord.length,
      skippedCount: result.value.transactions.length - toRecord.length,
    })
    for (const transaction of toRecord) {
      if (this.syncQueue.isDisposed) return
      await this.recordTransaction(transaction)
    }
    for (const accountTransactionId of toReconcile) {
      if (this.syncQueue.isDisposed) return
      await this.retryReconciliation(accountTransactionId)
    }
    await this.saveSyncPointer(period.to)
    this.run.deps.console.info("Finished FIO transaction sync.", {
      accountId: this.plugin.accountId,
      from: period.from,
      pluginId: this.plugin.id,
      recordedCount: toRecord.length,
      to: period.to,
    })
  }

  /**
   * Re-attempts reconciliation for a bank reference already recorded as an
   * account transaction, in case a prior sync recorded it but crashed or
   * failed before claiming it — `reconcileAccountTransaction` itself is the
   * guard against redoing work for one already claimed, at the cost of one
   * cheap read per already-recorded transaction in the sync window.
   */
  private async retryReconciliation(
    accountTransactionId: AccountTransactionId
  ): Promise<void> {
    const paymentId = await this.run.ok(
      reconcileAccountTransaction(accountTransactionId)
    )
    this.run.deps.console.debug("Re-checked FIO transaction reconciliation.", {
      accountId: this.plugin.accountId,
      accountTransactionId,
      paymentId,
      pluginId: this.plugin.id,
    })
  }

  private async recordTransaction(transaction: FioTransaction): Promise<void> {
    await this.run.deps.lockManager.request(
      `fio-transaction-${this.plugin.accountId}-${transaction.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock === null) {
          this.run.deps.console.debug("Skipped locked FIO transaction.", {
            accountId: this.plugin.accountId,
            bankReference: transaction.id,
            pluginId: this.plugin.id,
          })
          return
        }

        const bankReference = NonEmptyString255Schema.decode(transaction.id)

        const accountTransactionId = await this.run.ok(
          createAccountTransaction({
            accountId: this.plugin.accountId,
            amount: IntegerSchema.decode(transaction.amountMinor),
            currency: transaction.currency,
            occurredAt: TimestampMsSchema.decode(
              dateStringToDate(transaction.bookedDate).getTime()
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
        this.run.deps.console.debug("Reconciling FIO account transaction.", {
          accountId: this.plugin.accountId,
          accountTransactionId,
          bankReference,
          pluginId: this.plugin.id,
        })
        const paymentId = await this.run.ok(
          reconcileAccountTransaction(accountTransactionId)
        )
        this.run.deps.console.info("Created FIO account transaction.", {
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
    const to = dateToDateString(this.run.deps.date.now())
    const [pointer] = await this.run.deps.evolu.loadQuery(
      fioPluginSyncPointerByPluginIdQuery(this.plugin.id)
    )
    const syncLookbackDays =
      this.plugin.syncLookbackDays ?? defaultFioPluginSyncLookbackDays
    const from =
      pointer?.lastSyncedDate === null || pointer?.lastSyncedDate === undefined
        ? getFioFirstSyncDate(this.run.deps.date.now())
        : dateToDateString(
            subDays(dateStringToDate(pointer.lastSyncedDate), syncLookbackDays)
          )

    this.run.deps.console.debug("Resolved FIO sync period.", {
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
  ): Promise<{
    readonly toRecord: ReadonlyArray<FioTransaction>
    readonly toReconcile: ReadonlyArray<AccountTransactionId>
  }> {
    const bankReferences = getUniqueBankReferences(transactions)
    if (bankReferences.length === 0) {
      this.run.deps.console.debug("No FIO transactions have bank references.", {
        accountId: this.plugin.accountId,
        pluginId: this.plugin.id,
        transactionCount: transactions.length,
      })
      return { toRecord: [], toReconcile: [] }
    }

    const existing = await this.run.deps.evolu.loadQuery(
      existingFioTransactionBankReferencesQuery({
        accountId: this.plugin.accountId,
        bankReferences,
      })
    )
    const existingAccountTransactionIdByBankReference = new Map(
      existing.map((transaction) => [
        transaction.bankReference,
        transaction.accountTransactionId,
      ])
    )
    const selectedBankReferences = new Set<string>()
    const selectedTransactions: FioTransaction[] = []

    for (const transaction of transactions) {
      const bankReference = NonEmptyString255Schema.decode(transaction.id)
      if (existingAccountTransactionIdByBankReference.has(bankReference))
        continue
      if (selectedBankReferences.has(bankReference)) continue

      selectedBankReferences.add(bankReference)
      selectedTransactions.push(transaction)
    }

    this.run.deps.console.debug("Filtered FIO transactions.", {
      accountId: this.plugin.accountId,
      downloadedCount: transactions.length,
      existingCount: existingAccountTransactionIdByBankReference.size,
      pluginId: this.plugin.id,
      selectedCount: selectedTransactions.length,
      uniqueBankReferenceCount: bankReferences.length,
    })

    return {
      toRecord: selectedTransactions,
      toReconcile: [...existingAccountTransactionIdByBankReference.values()],
    }
  }

  private async saveSyncPointer(lastSyncedDate: DateString): Promise<void> {
    await runMutationWithCompletion((options) =>
      this.run.deps.evolu.upsert(
        "fioPluginSyncPointer",
        removeUndefinedValues({
          id: this.plugin.id,
          lastSyncedDate,
        }),
        { ...options, ownerId: this.run.deps.evoluOwnerId }
      )
    )
    this.run.deps.console.debug("Saved FIO sync pointer.", {
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

/**
 * Inverses, and they have to stay that way: `getSyncPeriod` round-trips a
 * stored pointer through both to walk the window back. Both work on the local
 * clock — `format` always did, and parsing as UTC used to shift the date a day
 * in negative offsets, landing `from` a day early.
 */
export const dateToDateString = (date: Date): DateString =>
  DateStringSchema.decode(format(date, "yyyy-MM-dd"))

export const dateStringToDate = (date: DateString): Date => parseISO(date)

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
  ].filter((part): part is string => part !== null && part.length > 0)

  if (parts.length === 0) return null

  return NonEmptyStringSchema.decode(parts.join(" | "))
}
