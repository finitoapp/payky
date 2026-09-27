import { ok, type Run } from "@evolu/common"

import type {
  AppBackgroundJob,
  AppBackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import {
  createEetSale,
  deliverEetSale,
} from "@/core/modules/eet/eet-actions.ts"
import {
  eetPaymentsToReportQuery,
  eetSalesToDeliverQuery,
} from "@/core/modules/eet/eet-queries.ts"
import type { EetSaleId } from "@/core/modules/eet/eet-types.ts"

const EET_RETRY_BASE_DELAY_MS = 30_000
const EET_RETRY_MAX_DELAY_MS = 15 * 60 * 1000

export const getEetRetryDelayMs = (
  failedAttempts: number,
  baseDelayMs = EET_RETRY_BASE_DELAY_MS
): number =>
  Math.min(baseDelayMs * 2 ** (failedAttempts - 1), EET_RETRY_MAX_DELAY_MS)

interface SaleBackoff {
  readonly failedAttempts: number
  readonly timer: ReturnType<typeof setTimeout> | null
}

export const createEetReportingJob =
  ({
    retryBaseDelayMs = EET_RETRY_BASE_DELAY_MS,
  }: {
    readonly retryBaseDelayMs?: number
  } = {}): AppBackgroundJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("eet-reporting-job"),
    })
    const reporting = new EetReporting(jobRun, retryBaseDelayMs)

    reporting.start()

    const disposer = new AsyncDisposableStack()
    disposer.use(jobRun)
    disposer.defer(() => reporting.dispose())

    return ok(disposer)
  }

export const startEetReportingJob = createEetReportingJob()

class EetReporting {
  private readonly run: Run<AppBackgroundJobContext>
  private readonly retryBaseDelayMs: number
  private readonly backoffs = new Map<EetSaleId, SaleBackoff>()
  private readonly unsubscribes: ReadonlyArray<() => void>
  private readonly queue = createKeyedTaskQueue<"create" | "deliver">({
    onError: (error) => this.run.deps.onError(error),
  })

  constructor(run: Run<AppBackgroundJobContext>, retryBaseDelayMs: number) {
    this.run = run
    this.retryBaseDelayMs = retryBaseDelayMs
    const { evolu, deviceId, connectivity } = run.deps
    this.unsubscribes = [
      evolu.subscribeQuery(eetPaymentsToReportQuery(deviceId))(() => {
        this.queueCreation()
      }),
      evolu.subscribeQuery(eetSalesToDeliverQuery(deviceId))(() => {
        this.queueDelivery()
      }),
      connectivity.onOnline(() => {
        this.retryNow()
      }),
    ]
  }

  start(): void {
    this.queueCreation()
    this.queueDelivery()
  }

  async dispose(): Promise<void> {
    if (this.queue.isDisposed) return

    for (const unsubscribe of this.unsubscribes) unsubscribe()
    for (const { timer } of this.backoffs.values()) {
      if (timer !== null) clearTimeout(timer)
    }
    this.backoffs.clear()
    await this.queue[Symbol.asyncDispose]()
  }

  private queueCreation(): void {
    this.queue.enqueue("create", () => this.createSales())
  }

  private queueDelivery(): void {
    this.queue.enqueue("deliver", () => this.deliverSales())
  }

  private retryNow(): void {
    for (const [saleId, backoff] of this.backoffs) {
      if (backoff.timer !== null) clearTimeout(backoff.timer)
      this.backoffs.set(saleId, { ...backoff, timer: null })
    }
    this.queueDelivery()
  }

  private async createSales(): Promise<void> {
    const { evolu, deviceId } = this.run.deps
    const payments = await evolu.loadQuery(eetPaymentsToReportQuery(deviceId))

    for (const payment of payments) {
      if (this.queue.isDisposed) return
      const saleId = await this.run.ok(createEetSale({ payment, deviceId }))
      if (saleId !== null) {
        this.run.deps.console.info("Created EET sale.", {
          paymentId: payment.id,
          saleId,
        })
      }
    }
  }

  private async deliverSales(): Promise<void> {
    const { evolu, deviceId } = this.run.deps
    const sales = await evolu.loadQuery(eetSalesToDeliverQuery(deviceId))

    for (const sale of sales) {
      if (this.queue.isDisposed) return
      if (this.isWaitingForRetry(sale.id)) continue

      const result = await this.run(deliverEetSale(sale.id))
      if (!result.ok) {
        this.run.deps.console.debug("Skipped EET delivery.", {
          saleId: sale.id,
          reason: result.error.type,
        })
        continue
      }

      if (result.value.type === "retry") {
        this.scheduleRetry(sale.id)
      } else {
        this.backoffs.delete(sale.id)
      }
      this.run.deps.console.info("Attempted EET delivery.", {
        saleId: sale.id,
        outcome: result.value.type,
      })
    }
  }

  private isWaitingForRetry(saleId: EetSaleId): boolean {
    return (this.backoffs.get(saleId)?.timer ?? null) !== null
  }

  private scheduleRetry(saleId: EetSaleId): void {
    const failedAttempts = (this.backoffs.get(saleId)?.failedAttempts ?? 0) + 1
    const delayMs = getEetRetryDelayMs(failedAttempts, this.retryBaseDelayMs)
    const timer = setTimeout(() => {
      const backoff = this.backoffs.get(saleId)
      if (backoff !== undefined) {
        this.backoffs.set(saleId, { ...backoff, timer: null })
      }
      this.queueDelivery()
    }, delayMs)
    ;(timer as { readonly unref?: () => void }).unref?.()
    this.backoffs.set(saleId, { failedAttempts, timer })
  }
}
