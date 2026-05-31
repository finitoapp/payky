import { createRun, ok } from "@evolu/common"
import { format, subMonths } from "date-fns"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import type { DateDep, FetchDep } from "@/core/deps.ts"
import {
  createFioApiDep,
  type FioTransaction,
  fetchFioLastTransactions,
  setFioLastDate,
} from "@/core/integrations/fio/fio-client.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionIbanByBankReferenceQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { activeFioPluginsQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
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

type Context = BackgroundJobContext & FetchDep & DateDep

const FIO_LAST_DATE_REPAIR_LOOKBACK_MONTHS = 2

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
      [Symbol.dispose]: () => {
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
  }

  private queueRefresh(): void {
    this.refreshQueue.enqueue("refresh", () => this.refreshPlugins())
  }

  private async refreshPlugins(): Promise<void> {
    const plugins = await loadActiveFioPlugins(this.context)
    const activePlugins = plugins.filter(hasFioTokens)
    const activeIds = new Set(activePlugins.map((plugin) => plugin.id))

    for (const [pluginId, sync] of this.pluginSyncs) {
      if (activeIds.has(pluginId)) continue

      sync.dispose()
      this.pluginSyncs.delete(pluginId)
    }

    for (const plugin of activePlugins) {
      const current = this.pluginSyncs.get(plugin.id)
      if (current?.matches(plugin) === true) continue

      current?.dispose()
      const sync = new FioPluginSync(this.context, plugin)
      this.pluginSyncs.set(plugin.id, sync)
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
    let result = await run(fetchFioLastTransactions())
    if (
      !result.ok &&
      result.error.type === "FioStrongAuthorizationRequiredError"
    ) {
      const repairResult = await run(
        setFioLastDate({
          date: getFioLastDateRepairDate(this.context.date.now()),
        })
      )
      if (!repairResult.ok) throw repairResult.error

      result = await run(fetchFioLastTransactions())
    }
    if (!result.ok) throw result.error
    if (result.value.iban !== this.plugin.iban) {
      this.context.console.warn("Skipped FIO statement for a different IBAN.", {
        accountId: this.plugin.accountId,
        pluginId: this.plugin.id,
      })
      return
    }

    for (const transaction of result.value.transactions) {
      if (this.syncQueue.isDisposed) return
      await this.recordTransaction(transaction)
    }
  }

  private getNextToken(): FioPluginToken {
    const token = this.plugin.tokens[this.tokenIndex] ?? this.plugin.tokens[0]
    this.tokenIndex =
      this.tokenIndex + 1 >= this.plugin.tokens.length ? 0 : this.tokenIndex + 1

    return token
  }

  private async recordTransaction(transaction: FioTransaction): Promise<void> {
    await navigator.locks.request(
      `fio-transaction-${this.plugin.accountId}-${transaction.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (lock == null) return

        const bankReference = NonEmptyString255Schema.decode(transaction.id)

        const existing = await this.context.evolu.loadQuery(
          accountTransactionIbanByBankReferenceQuery(
            this.plugin.accountId,
            bankReference
          )
        )
        if (existing.length > 0) return

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
              source: "automaticScript",
            },
            iban: {
              variableSymbol: transaction.variableSymbol,
              constantSymbol: transaction.constantSymbol,
              specificSymbol: transaction.specificSymbol,
              bankReference,
            },
          })
        )
        await run.orThrow(reconcileAccountTransaction(accountTransactionId))
        this.context.console.info("Created FIO account transaction.", {
          accountId: this.plugin.accountId,
          bankReference,
          pluginId: this.plugin.id,
        })
      }
    )
  }
}

const getFioLastDateRepairDate = (now: Date): DateString => {
  return DateStringSchema.decode(
    format(subMonths(now, FIO_LAST_DATE_REPAIR_LOOKBACK_MONTHS), "yyyy-MM-dd")
  )
}

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
