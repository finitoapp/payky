import { ok, type Run } from "@evolu/common"
import { syncLightningAddressPayment } from "../../modules/payment/payment-lightning-address-actions.ts"
import { unsettledLightningAddressPaymentsQuery } from "../../modules/payment/payment-queries.ts"
import type { PaymentId } from "../../modules/payment/payment-types.ts"
import type {
  AppBackgroundJob,
  AppBackgroundJobContext,
} from "../background-job-types.ts"
import { createKeyedTaskQueue } from "../keyed-task-queue.ts"

const VERIFY_POLL_BASE_DELAY_MS = 2_000
const VERIFY_POLL_MAX_DELAY_MS = 60_000
/** How long after its invoice expired a payment is still polled. */
const VERIFY_GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000

/** First poll after `baseDelayMs`, then doubling up to a minute. */
export const getLightningAddressVerifyDelayMs = (
  polls: number,
  baseDelayMs = VERIFY_POLL_BASE_DELAY_MS
): number => Math.min(baseDelayMs * 2 ** polls, VERIFY_POLL_MAX_DELAY_MS)

interface TrackedPayment {
  readonly invoiceExpiresAt: number
  readonly polls: number
  readonly timer: ReturnType<typeof setTimeout> | null
}

/**
 * Settles Lightning address payments nobody is watching
 * (lightning-address/0005): an invoice not yet proved paid is polled on its
 * LUD-21 verify URL until the wallet reveals the preimage, whichever device
 * is open — the wait screen may be closed, or on another device. It is
 * driven by the unsettled invoices themselves, like the Qerko job
 * (qerko/0005), and every write `syncLightningAddressPayment` makes is
 * idempotent, so it runs beside the wait screen's own polling and on several
 * devices at once. A payment is dropped a day after its invoice expired: a
 * wallet that has not settled it by then will not.
 */
export const createLightningAddressVerifyJob =
  ({
    retryBaseDelayMs = VERIFY_POLL_BASE_DELAY_MS,
    giveUpAfterMs = VERIFY_GIVE_UP_AFTER_MS,
  }: {
    readonly retryBaseDelayMs?: number
    readonly giveUpAfterMs?: number
  } = {}): AppBackgroundJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("lightning-address-verify-job"),
    })
    const verify = new LightningAddressVerify(
      jobRun,
      retryBaseDelayMs,
      giveUpAfterMs
    )

    verify.start()

    const disposer = new AsyncDisposableStack()
    disposer.use(jobRun)
    disposer.defer(() => verify.dispose())

    return ok(disposer)
  }

export const startLightningAddressVerifyJob = createLightningAddressVerifyJob()

class LightningAddressVerify {
  private readonly run: Run<AppBackgroundJobContext>
  private readonly baseDelayMs: number
  private readonly giveUpAfterMs: number
  private readonly tracked = new Map<PaymentId, TrackedPayment>()
  private readonly unsubscribes: ReadonlyArray<() => void>
  private readonly queue = createKeyedTaskQueue<string>({
    onError: (error) => this.run.deps.onError(error),
  })

  constructor(
    run: Run<AppBackgroundJobContext>,
    baseDelayMs: number,
    giveUpAfterMs: number
  ) {
    this.run = run
    this.baseDelayMs = baseDelayMs
    this.giveUpAfterMs = giveUpAfterMs
    const { evolu, connectivity } = run.deps
    this.unsubscribes = [
      evolu.subscribeQuery(unsettledLightningAddressPaymentsQuery)(() => {
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

  private isGivenUp(invoiceExpiresAt: number): boolean {
    return (
      this.run.deps.date.now().getTime() >=
      invoiceExpiresAt + this.giveUpAfterMs
    )
  }

  private forget(paymentId: PaymentId): void {
    const payment = this.tracked.get(paymentId)
    if (payment?.timer !== null && payment?.timer !== undefined) {
      clearTimeout(payment.timer)
    }
    this.tracked.delete(paymentId)
  }

  /** Starts watching new unsettled invoices and forgets the settled ones. */
  private async reconcile(): Promise<void> {
    const rows = await this.run.deps.evolu.loadQuery(
      unsettledLightningAddressPaymentsQuery
    )
    if (this.queue.isDisposed) return

    const watched = rows.filter((row) => !this.isGivenUp(row.invoiceExpiresAt))
    const watchedIds = new Set(watched.map((row) => row.id))
    for (const paymentId of this.tracked.keys()) {
      if (!watchedIds.has(paymentId)) this.forget(paymentId)
    }

    for (const row of watched) {
      const payment = this.tracked.get(row.id)
      if (payment?.invoiceExpiresAt === row.invoiceExpiresAt) continue
      // A new invoice for a payment already watched starts over.
      this.forget(row.id)
      this.track(row.id, row.invoiceExpiresAt, 0)
    }
  }

  private track(
    paymentId: PaymentId,
    invoiceExpiresAt: number,
    polls: number
  ): void {
    const timer = setTimeout(
      () => {
        this.queue.enqueue(paymentId, () => this.poll(paymentId))
      },
      getLightningAddressVerifyDelayMs(polls, this.baseDelayMs)
    )
    ;(timer as { readonly unref?: () => void }).unref?.()
    this.tracked.set(paymentId, { invoiceExpiresAt, polls, timer })
  }

  private pollAllNow(): void {
    for (const [paymentId, payment] of this.tracked) {
      if (payment.timer !== null) clearTimeout(payment.timer)
      this.tracked.set(paymentId, { ...payment, polls: 0, timer: null })
      this.queue.enqueue(paymentId, () => this.poll(paymentId))
    }
  }

  private async poll(paymentId: PaymentId): Promise<void> {
    const payment = this.tracked.get(paymentId)
    if (payment === undefined) return
    if (this.isGivenUp(payment.invoiceExpiresAt)) {
      this.tracked.delete(paymentId)
      return
    }

    const result = await this.run(
      syncLightningAddressPayment({
        paymentId,
        deviceId: this.run.deps.deviceId,
      })
    )
    if (this.queue.isDisposed) return

    if (!result.ok) {
      this.run.deps.console.debug("Lightning address verify failed.", {
        paymentId,
        reason: result.error.type,
      })
      if (result.error.type === "PaymentLightningAddressNotFound") {
        this.tracked.delete(paymentId)
        return
      }
      // Offline, the wallet down, or an answer about another invoice: the
      // wallet may still settle it, so it is asked again later.
      this.track(paymentId, payment.invoiceExpiresAt, payment.polls + 1)
      return
    }

    if (result.value !== "paid") {
      this.track(paymentId, payment.invoiceExpiresAt, payment.polls + 1)
      return
    }

    this.run.deps.console.info("Settled a Lightning address payment.", {
      paymentId,
    })
    this.tracked.delete(paymentId)
  }
}
