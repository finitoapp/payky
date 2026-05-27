import { z } from "zod"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PaymentStatusSchema,
  PositiveNumberSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "@/core/modules/shared/schema.ts"
import { TableId } from "@/core/modules/table/table-types.ts"

export const payment = {
  id: PaymentId,
  deviceId: DeviceId.nullable(),
  billId: BillId.nullable(),
  tableId: TableId.nullable(),
  status: PaymentStatusSchema,
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  tipAmount: NonNegativeIntegerSchema,
  accountTransactionId: AccountTransactionId.nullable(),
  paidAt: TimestampMsSchema.nullable(),
  expiresAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
} as const

export const paymentCashRegister = {
  id: PaymentId,
  accountId: AccountId,
} as const

export const paymentSpark = {
  id: PaymentId,
  accountId: AccountId,
  btcAmountSats: NonNegativeIntegerSchema,
  exchangeRate: PositiveNumberSchema,
  exchangeRateSource: z.enum(["yadio"]),
  exchangeRateFetchedAt: TimestampMsSchema,
  sparkInvoice: NonEmptyStringSchema,
  sparkTechnicalDataJson: z.string().nullable(),
} as const

export const paymentIban = {
  id: PaymentId,
  accountId: AccountId,
  variableSymbol: VariableSymbolSchema.nullable(),
  czQrPayload: NonEmptyStringSchema,
} as const

export type PaymentRow = InferTable<typeof payment>
export type PaymentCashRegisterRow = InferTable<typeof paymentCashRegister>
export type PaymentSparkRow = InferTable<typeof paymentSpark>
export type PaymentIbanRow = InferTable<typeof paymentIban>
