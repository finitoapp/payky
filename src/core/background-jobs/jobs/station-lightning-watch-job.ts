import { DateIso, ok } from "@evolu/common"
import { subDays } from "date-fns"

import type { StationJob } from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import { DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS } from "@/core/modules/payment/payment-status-utils.ts"
import { recordAutomaticAccountTransaction } from "@/core/modules/reconciliation-claim/reconciliation-claim-actions.ts"
import type { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IntegerSchema,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { STATION_REPORT_WINDOW_DAYS } from "@/core/modules/station/station-outbox-actions.ts"
import {
  type StationLightningWatchRow,
  stationLightningWatchQuery,
} from "@/core/modules/station/station-queries.ts"
import type { SparkPaymentWallet } from "@/core/spark/spark-wallet.ts"

/**
 * The receive request status that means the money reached the owner's
 * wallet. The transfer id and preimage show up a moment earlier, while the
 * request still reads as created, so they are no sign of payment.
 */
const PAID_STATUS = "TRANSFER_COMPLETED"

/** How long after an invoice expires a late payment is still looked for. */
const GRACE_MS = 10 * 60_000

/**
 * A station's Lightning invoices pay its owner's wallet (station/0003), so
 * no transfer ever reaches the station's own. It asks Spark about each open
 * invoice instead, every few seconds while the invoice can still be paid
 * and once at start for the rest of the week's, and records the payment
 * paid the moment its request completes.
 */
export const createStationLightningWatchJob =
  ({
    pollIntervalMs = 3_000,
  }: {
    readonly pollIntervalMs?: number
  } = {}): StationJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("station-lightning-watch-job"),
    })
    const { evolu, date } = jobRun.deps
    const createdSince = DateIso.orThrow(
      subDays(date.now(), STATION_REPORT_WINDOW_DAYS).toISOString()
    )
    const checkedOnce = new Set<string>()
    const queue = createKeyedTaskQueue<"poll">({
      onError: (error) => jobRun.deps.onError(error),
    })
    let wallet:
      | { readonly secret: SparkSecret; readonly lease: SparkPaymentWallet }
      | undefined

    const releaseWallet = async (): Promise<void> => {
      const current = wallet
      wallet = undefined
      await current?.lease[Symbol.asyncDispose]()
    }

    const walletFor = async (
      secret: SparkSecret
    ): Promise<SparkPaymentWallet> => {
      if (wallet?.secret === secret) return wallet.lease
      await releaseWallet()
      const lease = await jobRun.deps.sparkWallet.create(secret)
      wallet = { secret, lease }
      return lease
    }

    const isOpen = (row: StationLightningWatchRow, now: number): boolean =>
      now <
      (row.expiresAt ??
        Date.parse(row.createdAt) +
          DEFAULT_LIGHTNING_INVOICE_EXPIRY_SECONDS * 1000) +
        GRACE_MS

    const check = async (row: StationLightningWatchRow): Promise<void> => {
      const request = await (
        await walletFor(row.secret)
      ).getLightningReceiveRequest(row.lightningReceiveRequestId)
      checkedOnce.add(row.id)
      if (request?.status !== PAID_STATUS || request.sparkTransferId === null) {
        return
      }

      const recorded = await jobRun.ok(
        recordAutomaticAccountTransaction({
          accountId: row.accountId,
          amount: IntegerSchema.decode(row.amountSats),
          currency: "BTC",
          occurredAt: TimestampMsSchema.decode(date.now().getTime()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "auto" },
          spark: {
            sparkTransferId: NonEmptyStringSchema.decode(
              request.sparkTransferId
            ),
            lightning: {
              lnInvoice: row.lnInvoice,
              preImage:
                request.paymentPreimage === null
                  ? null
                  : NonEmptyStringSchema.decode(request.paymentPreimage),
              paymentHash: row.paymentHash,
            },
          },
        })
      )
      jobRun.deps.console.info("Recorded a paid station Lightning invoice.", {
        paymentId: recorded.paymentId,
        sparkTransferId: request.sparkTransferId,
      })
    }

    const poll = async (): Promise<void> => {
      const now = date.now().getTime()
      const rows = await evolu.loadQuery(
        stationLightningWatchQuery(createdSince)
      )
      const due = rows.filter(
        (row) => !checkedOnce.has(row.id) || isOpen(row, now)
      )
      if (due.length === 0) {
        await releaseWallet()
        return
      }
      for (const row of due) {
        if (queue.isDisposed) return
        try {
          await check(row)
        } catch (error) {
          // Spark unreachable: the next poll asks again.
          jobRun.deps.console.warn("Could not check a Lightning invoice.", {
            paymentId: row.id,
            error,
          })
        }
      }
    }

    const pollSoon = (): void => queue.enqueue("poll", poll)
    const timer = setInterval(pollSoon, pollIntervalMs)
    ;(timer as { readonly unref?: () => void }).unref?.()
    pollSoon()

    return ok({
      async [Symbol.asyncDispose]() {
        clearInterval(timer)
        await queue[Symbol.asyncDispose]()
        await releaseWallet()
        await jobRun[Symbol.asyncDispose]()
      },
    })
  }

export const startStationLightningWatchJob = createStationLightningWatchJob()
