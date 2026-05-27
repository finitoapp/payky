import { z } from "zod"

import { BillId } from "@/modules/bill/bill-types.ts"
import { DeviceId } from "@/modules/device/device-types.ts"
import { PaymentId } from "@/modules/payment/payment-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  PositiveNumberSchema,
  TimestampMsSchema,
} from "@/modules/shared/schema.ts"
import { TableId } from "@/modules/table/table-types.ts"

export const payment = {
  id: PaymentId,
  deviceId: DeviceId.nullable(),
  billId: BillId.nullable(),
  tableId: TableId.nullable(),
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  fiatAmount: NonNegativeIntegerSchema,
  fiatCurrency: FiatCurrencySchema,
  tipAmount: NonNegativeIntegerSchema,
  btcAmountSats: NonNegativeIntegerSchema.nullable(),
  exchangeRate: PositiveNumberSchema.nullable(),
  exchangeRateSource: z.enum(["yadio"]).nullable(),
  exchangeRateFetchedAt: TimestampMsSchema.nullable(),
  variableSymbol: NonEmptyString255Schema.nullable(),
  bankQrPayload: NonEmptyStringSchema.nullable(),
  sparkInvoice: NonEmptyStringSchema.nullable(),
  sparkTechnicalDataJson: z.string().nullable(),
  paidAt: TimestampMsSchema.nullable(),
  expiresAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
} as const

export type PaymentRow = InferTable<typeof payment>
