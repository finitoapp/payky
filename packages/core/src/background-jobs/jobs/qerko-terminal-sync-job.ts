import { ok, type Run } from "@evolu/common"
import { syncQerkoTerminalPayment } from "../../modules/payment/payment-qerko-actions.ts"
import { pendingQerkoTerminalPaymentsQuery } from "../../modules/payment/payment-queries.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import type {
  AppBackgroundJob,
  AppBackgroundJobContext,
} from "../background-job-types.ts"
import { createKeyedTaskQueue } from "../keyed-task-queue.ts"

const QERKO_POLL_BASE_DELAY_MS = 1_000
const QERKO_POLL_MAX_DELAY_MS = 60_000

/** First poll after `baseDelayMs`, then doubling up to a minute. */
export const getQerkoPollDelayMs = (
  polls: number,
  baseDelayMs = QERKO_POLL_BASE_DELAY_MS
): number => Math.min(baseDelayMs * 2 ** polls, QERKO_POLL_MAX_DELAY_MS)

interface TrackedAttempt {
  readonly attemptId: string
  readonly polls: number
  readonly timer: ReturnType<typeof setTimeout> | null
}

/**
 * Settles Qerko card payments nobody is watching (qerko/0005): a pending
 * attempt is polled until Qerko gives a final answer, whichever device is
 * open — the one that started it may be closed, offline or gone. It is driven
 * by the pending attempts themselves, so it needs no schedule of its own, and
 * every write `syncQerkoTerminalPayment` makes is idempotent, which is what
 * lets this run beside the payment screen's own polling and on several
 * devices at once.
 */
export const createQerkoTerminalSyncJob =
  ({
    retryBaseDelayMs = QERKO_POLL_BASE_DELAY_MS,
  }: {
    readonly retryBaseDelayMs?: number
  } = {}): AppBackgroundJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("qerko-terminal-sync-job"),
    })
    const sync = new QerkoTerminalSync(jobRun, retryBaseDelayMs)

    sync.start()

    const disposer = new AsyncDisposableStack()
    disposer.use(jobRun)
    disposer.defer(() => sync.dispose())

    return ok(disposer)
  }

export const startQerkoTerminalSyncJob = createQerkoTerminalSyncJob()

class QerkoTerminalSync {
  private readonly run: Run<AppBackgroundJobContext>
  private readonly baseDelayMs: number
  private readonly tracked = new Map<PaymentId, TrackedAttempt>()
  private readonly unsubscribes: ReadonlyArray<() => void>
  private readonly queue = createKeyedTaskQueue<string>({
    onError: (error) => this.run.deps.onError(error),
  })

  constructor(run: Run<AppBackgroundJobContext>, baseDelayMs: number) {
    this.run = run
    this.baseDelayMs = baseDelayMs
    const { evolu, connectivity } = run.deps
    this.unsubscribes = [
      evolu.subscribeQuery(pendingQerkoTerminalPaymentsQuery)(() => {
        this.queueReconcile()
      }),
      connectivity.onOnline(() => {
        this.pollAllNow()
      }),
    ]
  }

  start(): void {
    this.queueReconcile()
  }

  async dispose(): Promise<void> {
    if (this.queue.isDisposed) return

    for (const unsubscribe of this.unsubscribes) unsubscribe()
    for (const { timer } of this.tracked.values()) {
      if (timer !== null) clearTimeout(timer)
    }
    this.tracked.clear()
    await this.queue[Symbol.asyncDispose]()
  }

  private queueReconcile(): void {
    this.queue.enqueue("reconcile", () => this.reconcile())
  }

  /** Starts watching new pending attempts and forgets the ones that ended. */
  private async reconcile(): Promise<void> {
    const rows = await this.run.deps.evolu.loadQuery(
      pendingQerkoTerminalPaymentsQuery
    )
    if (this.queue.isDisposed) return

    const pendingIds = new Set(rows.map(({ id }) => id))
    for (const [paymentId, attempt] of this.tracked) {
      if (pendingIds.has(paymentId)) continue
      if (attempt.timer !== null) clearTimeout(attempt.timer)
      this.tracked.delete(paymentId)
    }

    for (const row of rows) {
      const attempt = this.tracked.get(row.id)
      if (attempt?.attemptId === row.pendingTransactionId) continue
      // A new attempt on a payment already watched starts over.
      if (attempt !== undefined && attempt.timer !== null) {
        clearTimeout(attempt.timer)
      }
      this.track(row.id, row.pendingTransactionId, 0)
    }
  }

  private track(paymentId: PaymentId, attemptId: string, polls: number): void {
    const timer = setTimeout(
      () => {
        this.queue.enqueue(paymentId, () => this.poll(paymentId))
      },
      getQerkoPollDelayMs(polls, this.baseDelayMs)
    )
    ;(timer as { readonly unref?: () => void }).unref?.()
    this.tracked.set(paymentId, { attemptId, polls, timer })
  }

  private pollAllNow(): void {
    for (const [paymentId, attempt] of this.tracked) {
      if (attempt.timer !== null) clearTimeout(attempt.timer)
      this.tracked.set(paymentId, { ...attempt, polls: 0, timer: null })
      this.queue.enqueue(paymentId, () => this.poll(paymentId))
    }
  }

  private async poll(paymentId: PaymentId): Promise<void> {
    const attempt = this.tracked.get(paymentId)
    if (attempt === undefined) return

    const result = await this.run(
      syncQerkoTerminalPayment({
        paymentId,
        deviceId: this.run.deps.deviceId,
      })
    )
    if (this.queue.isDisposed) return

    if (!result.ok) {
      this.run.deps.console.debug("Qerko payment poll failed.", {
        paymentId,
        reason: result.error.type,
      })
      // A definite answer ended the attempt; anything else (offline, Qerko
      // down) is tried again later.
      if (
        result.error.type === "QerkoTerminalPaymentFailed" ||
        result.error.type === "PaymentNotFound"
      ) {
        this.tracked.delete(paymentId)
        return
      }
      this.track(paymentId, attempt.attemptId, attempt.polls + 1)
      return
    }

    if (result.value.status === "pending") {
      this.track(paymentId, attempt.attemptId, attempt.polls + 1)
      return
    }

    this.run.deps.console.info("Settled Qerko payment poll.", {
      paymentId,
      status: result.value.status,
    })
    this.tracked.delete(paymentId)
  }
}
