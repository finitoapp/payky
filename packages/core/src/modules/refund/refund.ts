import type { IndexesConfig } from "@evolu/common/local-first"

import { z } from "zod"
import { DeviceId } from "../device/device-types.ts"
import { PaymentId } from "../payment/payment-types.ts"
import { PaymentLineId } from "../payment-line/payment-line-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  SqliteTrueSchema,
  TimestampMsSchema,
} from "../shared/schema.ts"
import { RefundId, RefundLineId, RefundMethodSchema } from "./refund-types.ts"

export const refund = {
  id: RefundId,
  paymentId: PaymentId,
  deviceId: DeviceId.nullable(),
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  method: RefundMethodSchema,
  refundedAt: TimestampMsSchema,
  isTip: SqliteTrueSchema.nullable(),
} as const

export const refundLine = {
  id: RefundLineId,
  refundId: RefundId,
  paymentId: PaymentId,
  paymentLineId: PaymentLineId,
  quantity: PositiveNumberSchema,
  amount: NonNegativeIntegerSchema,
} as const

/**
 * A refund to the card the Qerko terminal is still working on (qerko/0004).
 * The `refund` row and its money movement exist only once the terminal
 * approved, so everything that reads refunds stays as it is; until then this
 * row is all there is. Its id is the id the refund will have.
 *
 * `pending` is polled until Qerko answers; `unknown` means the card may have
 * been refunded and blocks another attempt until staff dismiss it after
 * checking; `failed` is a definite no, kept so the screen can say so. The
 * goods lines of the refund wait here as `linesJson`, to be written beside
 * the refund when it is approved.
 */
export const qerkoTerminalRefundAttempt = {
  id: RefundId,
  paymentId: PaymentId,
  deviceId: DeviceId.nullable(),
  /** Qerko's UUID for this attempt, stored before the request leaves. */
  transactionId: NonEmptyString255Schema,
  terminalId: NonEmptyString255Schema,
  amount: NonNegativeIntegerSchema,
  isTip: SqliteTrueSchema.nullable(),
  linesJson: NonEmptyStringSchema.nullable(),
  status: z.enum(["pending", "failed", "unknown"]),
  failureReason: z.enum(["declined", "cancelled"]).nullable(),
  startedAt: TimestampMsSchema,
} as const

export const refundIndexes = ((create) => [
  create("refund_paymentId").on("refund").column("paymentId"),
  create("refund_deviceId").on("refund").column("deviceId"),
  // The sales statistics count a refund on the day it was paid out.
  create("refund_refundedAt").on("refund").column("refundedAt"),
  create("refundLine_paymentId").on("refundLine").column("paymentId"),
  create("qerkoTerminalRefundAttempt_paymentId")
    .on("qerkoTerminalRefundAttempt")
    .column("paymentId"),
  create("qerkoTerminalRefundAttempt_status")
    .on("qerkoTerminalRefundAttempt")
    .column("status"),
]) satisfies IndexesConfig

export type RefundRow = InferTable<typeof refund>
export type RefundLineRow = InferTable<typeof refundLine>
export type QerkoTerminalRefundAttemptRow = InferTable<
  typeof qerkoTerminalRefundAttempt
>
