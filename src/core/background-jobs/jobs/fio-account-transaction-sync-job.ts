import { type ConsoleDep, createRun } from "@evolu/common"

import type {
  BackgroundJob,
  BackgroundJobOnErrorDep,
} from "@/core/background-jobs/background-job-types.ts"
import type { FetchDep } from "@/core/deps.ts"
import {
  createFioApiDep,
  type FioTransaction,
  fetchFioLastTransactions,
} from "@/core/integrations/fio/fio-client.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionIbanByBankReferenceQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import { activeFioPluginsQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

type BackgroundJobDeps = Parameters<BackgroundJob>[0]

type FioAccountSyncDeps = EvoluDep &
  FetchDep &
  ConsoleDep &
  BackgroundJobOnErrorDep

interface FioAccountTransactionSyncJobOptions {
  readonly fetch?: typeof globalThis.fetch
}

const loadActiveFioPlugins = (deps: EvoluDep) =>
  deps.evolu.loadQuery(activeFioPluginsQuery)

type ActiveFioPlugin = Awaited<ReturnType<typeof loadActiveFioPlugins>>[number]
type FioPluginToken = ActiveFioPlugin["tokens"][number]
type ActiveFioPluginWithTokens = ActiveFioPlugin & {
  readonly tokens: readonly [FioPluginToken, ...FioPluginToken[]]
}

const fioTransactionWriteLocks = new Map<string, Promise<void>>()

export const createFioAccountTransactionSyncJob =
  ({
    fetch = globalThis.fetch,
  }: FioAccountTransactionSyncJobOptions = {}): BackgroundJob =>
  (context) => {
    const sync = new FioAccountTransactionSync(
      {
        ...context,
        console: context.console.child("fio-account-transaction-sync-job"),
        fetch,
      },
      context
    )

    sync.start()

    return {
      [Symbol.dispose]: () => {
        sync.dispose()
      },
    }
  }

export const startFioAccountTransactionSyncJob =
  createFioAccountTransactionSyncJob()

class FioAccountTransactionSync {
  private readonly pluginSyncs = new Map<FioPluginId, FioPluginSync>()
  private readonly unsubscribePlugins: () => void
  private disposed = false
  private refreshRunning = false
  private refreshQueued = false
  private readonly deps: FioAccountSyncDeps
  private readonly context: BackgroundJobDeps

  constructor(deps: FioAccountSyncDeps, context: BackgroundJobDeps) {
    this.deps = deps
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
    if (this.disposed) return

    this.disposed = true
    this.unsubscribePlugins()

    for (const sync of this.pluginSyncs.values()) {
      sync.dispose()
    }
    this.pluginSyncs.clear()
  }

  private queueRefresh(): void {
    if (this.disposed) return

    void this.refreshPlugins().catch((error: unknown) => {
      this.context.onError(error)
    })
  }

  private async refreshPlugins(): Promise<void> {
    if (this.refreshRunning) {
      this.refreshQueued = true
      return
    }

    this.refreshRunning = true

    try {
      do {
        this.refreshQueued = false
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
          const sync = new FioPluginSync(this.deps, plugin)
          this.pluginSyncs.set(plugin.id, sync)
          sync.start()
        }
      } while (this.refreshQueued && !this.disposed)
    } finally {
      this.refreshRunning = false
    }
  }
}

class FioPluginSync {
  private readonly timer: ReturnType<typeof setInterval>
  private disposed = false
  private syncRunning = false
  private syncQueued = false
  private readonly deps: FioAccountSyncDeps
  private readonly plugin: ActiveFioPluginWithTokens

  constructor(deps: FioAccountSyncDeps, plugin: ActiveFioPluginWithTokens) {
    this.deps = deps
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
    if (this.disposed) return

    this.disposed = true
    clearInterval(this.timer)
  }

  matches(plugin: ActiveFioPlugin): boolean {
    return (
      this.plugin.accountId === plugin.accountId &&
      this.plugin.apiUrl === plugin.apiUrl &&
      this.plugin.numberOfSecondsBetweenChecks ===
        plugin.numberOfSecondsBetweenChecks &&
      this.plugin.iban === plugin.iban &&
      areTokensEqual(this.plugin.tokens, plugin.tokens)
    )
  }

  private queueSync(): void {
    if (this.disposed) return

    void this.syncTransactions().catch((error: unknown) => {
      this.deps.onError(error)
    })
  }

  private async syncTransactions(): Promise<void> {
    if (this.syncRunning) {
      this.syncQueued = true
      return
    }

    this.syncRunning = true

    try {
      do {
        this.syncQueued = false
        const [firstToken, ...restTokens] = this.plugin.tokens
        const run = createRun({
          ...this.deps,
          ...createFioApiDep({
            baseUrl: this.plugin.apiUrl,
            tokens: [firstToken.token, ...restTokens.map((row) => row.token)],
          }),
        })
        const result = await run(fetchFioLastTransactions())
        if (!result.ok) throw result.error
        if (result.value.iban !== this.plugin.iban) {
          this.deps.console.warn(
            "Skipped FIO statement for a different IBAN.",
            {
              accountId: this.plugin.accountId,
              pluginId: this.plugin.id,
            }
          )
          return
        }

        for (const transaction of result.value.transactions) {
          if (this.disposed) return
          await this.recordTransaction(transaction)
        }
      } while (this.syncQueued && !this.disposed)
    } finally {
      this.syncRunning = false
    }
  }

  private async recordTransaction(transaction: FioTransaction): Promise<void> {
    const bankReference = NonEmptyString255Schema.decode(transaction.id)
    const lockKey = `${this.plugin.accountId}:${bankReference}`

    await runWithFioTransactionWriteLock(lockKey, async () => {
      const existing = await this.deps.evolu.loadQuery(
        accountTransactionIbanByBankReferenceQuery(
          this.plugin.accountId,
          bankReference
        )
      )
      if (existing.length > 0) return

      const run = createRun(this.deps)
      await run.orThrow(
        createAccountTransaction({
          deviceId: null,
          accountId: this.plugin.accountId,
          amount: IntegerSchema.decode(transaction.amountMinor),
          currency: transaction.currency,
          occurredAt: TimestampMsSchema.decode(
            Date.parse(`${transaction.bookedDate}T00:00:00.000Z`)
          ),
          note: createTransactionNote(transaction),
          internalTransferGroupId: null,
          iban: {
            variableSymbol: transaction.variableSymbol,
            constantSymbol: transaction.constantSymbol,
            specificSymbol: transaction.specificSymbol,
            bankReference,
          },
        })
      )
      this.deps.console.info("Created FIO account transaction.", {
        accountId: this.plugin.accountId,
        bankReference,
        pluginId: this.plugin.id,
      })
    })
  }
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

const runWithFioTransactionWriteLock = async (
  key: string,
  write: () => Promise<void>
): Promise<void> => {
  const previous = fioTransactionWriteLocks.get(key) ?? Promise.resolve()
  const current = previous.then(write, write)
  fioTransactionWriteLocks.set(key, current)

  try {
    await current
  } finally {
    if (fioTransactionWriteLocks.get(key) === current) {
      fioTransactionWriteLocks.delete(key)
    }
  }
}

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
