import { z } from "zod"
import {
  SPARK_TRANSFER_STATUS_COMPLETED,
  type SparkExitSpeed,
} from "@/core/spark/spark-wallet.ts"
import type { WithdrawalQuote } from "./withdraw-actions.ts"

export const computeTotalDebitedSats = ({
  amountSats,
  withdrawAll,
  availableSats,
  feeSats,
}: {
  readonly amountSats: number
  readonly withdrawAll: boolean
  readonly availableSats: number
  readonly feeSats: number
}): number => (withdrawAll ? availableSats : amountSats + feeSats)

/**
 * What the recipient of an on-chain "withdraw all" gets: the SDK deducts the
 * fee from the balance it sends (`deductFeeFromWithdrawalAmount`). Zero or
 * less means the balance does not cover the fee.
 */
export const onchainWithdrawAllAmountSats = ({
  availableSats,
  feeSats,
}: {
  readonly availableSats: number
  readonly feeSats: number
}): number => availableSats - feeSats

/**
 * What the recipient of `quote` gets at `exitSpeed`: the quoted amount, or for
 * an on-chain "withdraw all" the quoted balance minus that speed's fee.
 */
export const withdrawalRecipientSats = (
  quote: WithdrawalQuote,
  exitSpeed: SparkExitSpeed
): number =>
  quote.kind === "onchain" && quote.withdrawAll
    ? onchainWithdrawAllAmountSats({
        availableSats: quote.availableSats,
        feeSats: quote.feeQuote[exitSpeed].totalFeeSats,
      })
    : quote.amountSats

/**
 * The smallest on-chain withdrawal the SSP accepts, per Spark's "Withdraw to
 * L1" docs. Checked before quoting so the merchant hears it up front instead
 * of as a failed fee quote.
 */
export const ONCHAIN_WITHDRAWAL_MIN_SATS = 10_000

/** An on-chain "withdraw all" whose fee leaves the recipient under the minimum. */
export const isOnchainWithdrawAllBelowMinimum = ({
  withdrawAll,
  availableSats,
  feeSats,
}: {
  readonly withdrawAll: boolean
  readonly availableSats: number
  readonly feeSats: number
}): boolean =>
  withdrawAll &&
  onchainWithdrawAllAmountSats({ availableSats, feeSats }) <
    ONCHAIN_WITHDRAWAL_MIN_SATS

/**
 * The most a Lightning withdrawal may cost (withdraw/0004). The SDK charges a
 * fresh estimate when it sends and refuses when that exceeds this, so the
 * reserve only covers the fee rising between review and confirmation.
 */
// ponytail: fixed reserve heuristic, tune from real failure rate
export const lightningMaxFeeSats = (estimateSats: number): number =>
  estimateSats + Math.max(Math.ceil(estimateSats * 0.1), 3)

/**
 * How long before a fee quote's or an invoice's expiry a withdrawal is
 * already refused: the SSP stamps `expiresAt` by its clock, this device
 * compares by its own, and sending takes a moment.
 */
export const WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS = 60_000

/**
 * How long a Lightning withdrawal stays under the sync job's check. Derived
 * from the SDK's `LIGHTNING_SEND_EXPIRY_MS` (384 h, 16 days; the SSP requires
 * at least 15) plus a day: a refund can arrive until the transfer expires.
 * Recheck it when upgrading `@buildonspark/spark-sdk`.
 */
export const WITHDRAWAL_CHECK_WINDOW_MS = 17 * 24 * 60 * 60 * 1000

/** On the device that created the withdrawal, a missing transfer is final after this. */
export const WITHDRAWAL_SEND_TIMEOUT_MS = 10 * 60 * 1000

/** On any other device — its clock may differ — only after this (withdraw/0007). */
export const WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS = 24 * 60 * 60 * 1000

/**
 * `LightningSendRequestStatus` values taken to mean the payment failed for
 * good and the money returned. Only the ones mainnet confirmed belong here;
 * `TRANSFER_FAILED`, `PREIMAGE_PROVIDING_FAILED` (the payment may have gone
 * through) and `USER_TRANSFER_VALIDATION_FAILED` wait for that check.
 */
const FINAL_LIGHTNING_SEND_FAILURES: ReadonlySet<string> = new Set([
  "LIGHTNING_PAYMENT_FAILED",
  "USER_SWAP_RETURNED",
])

/**
 * Transfer statuses of an unclaimed Spark-fallback payment that mean the
 * money came back. Empty until mainnet shows which ones do (withdraw/0003);
 * until then such a withdrawal waits.
 */
const RETURNED_SPARK_TRANSFER_STATUSES: ReadonlySet<string> = new Set()

const LightningSendUserRequestSchema = z.looseObject({
  status: z.string().optional(),
  paymentPreimage: z.string().nullish(),
})

export interface PendingWithdrawalTransfer {
  readonly status: string
  /** `TRANSFER` when the SDK paid over the Spark fallback, `PREIMAGE_SWAP` over the SSP. */
  readonly type: string
  readonly userRequest: unknown
}

const SPARK_FALLBACK_TRANSFER_TYPE = "TRANSFER"

export type PendingWithdrawalVerdict =
  | "record"
  | "returned"
  | "not-created"
  | "wait"

/**
 * What the sync job does about one Lightning withdrawal that has neither an
 * account transaction nor `failedAt` yet, given its Spark transfer
 * (`undefined` when none exists).
 */
export const classifyPendingWithdrawal = ({
  withdrawal,
  transfer,
  now,
  isSending,
}: {
  readonly withdrawal: {
    readonly createdAt: number
    readonly createdOnThisDevice: boolean
  }
  readonly transfer: PendingWithdrawalTransfer | undefined
  readonly now: number
  /** This device holds the withdrawal's `withdrawal-<id>` lock: it is still sending. */
  readonly isSending: boolean
}): PendingWithdrawalVerdict => {
  if (transfer === undefined) {
    if (withdrawal.createdOnThisDevice && isSending) return "wait"
    const timeout = withdrawal.createdOnThisDevice
      ? WITHDRAWAL_SEND_TIMEOUT_MS
      : WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS
    return now - withdrawal.createdAt >= timeout ? "not-created" : "wait"
  }

  const returnedOrWait = RETURNED_SPARK_TRANSFER_STATUSES.has(transfer.status)
    ? "returned"
    : "wait"

  // Paid over the Spark fallback: a completed transfer is the payment itself.
  if (transfer.type === SPARK_FALLBACK_TRANSFER_TYPE) {
    return transfer.status === SPARK_TRANSFER_STATUS_COMPLETED
      ? "record"
      : returnedOrWait
  }

  // Over the SSP the transfer completes once the SSP claims it, before the
  // Lightning payment settles; only the preimage proves it (withdraw/0002).
  // A missing user request is one the SSP has not indexed yet.
  if (transfer.userRequest === undefined || transfer.userRequest === null) {
    return returnedOrWait
  }

  const request = LightningSendUserRequestSchema.safeParse(transfer.userRequest)
  if (!request.success) return "wait"
  if (
    transfer.status === SPARK_TRANSFER_STATUS_COMPLETED &&
    request.data.paymentPreimage
  ) {
    return "record"
  }
  return request.data.status !== undefined &&
    FINAL_LIGHTNING_SEND_FAILURES.has(request.data.status)
    ? "returned"
    : "wait"
}
