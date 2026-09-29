import type { IndexesConfig } from "@evolu/common/local-first"

import { DeviceId } from "@/core/modules/device/device-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import {
  RefundId,
  RefundLineId,
  RefundMethodSchema,
} from "@/core/modules/refund/refund-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

export const refund = {
  id: RefundId,
  paymentId: PaymentId,
  deviceId: DeviceId.nullable(),
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  method: RefundMethodSchema,
  refundedAt: TimestampMsSchema,
} as const

export const refundLine = {
  id: RefundLineId,
  refundId: RefundId,
  paymentId: PaymentId,
  paymentLineId: PaymentLineId,
  quantity: PositiveNumberSchema,
  amount: NonNegativeIntegerSchema,
} as const

export const refundIndexes = ((create) => [
  create("refund_paymentId").on("refund").column("paymentId"),
  create("refund_deviceId").on("refund").column("deviceId"),
  create("refundLine_paymentId").on("refundLine").column("paymentId"),
]) satisfies IndexesConfig

export type RefundRow = InferTable<typeof refund>
export type RefundLineRow = InferTable<typeof refundLine>
