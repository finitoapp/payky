import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
  SpecificSymbolSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "@/core/modules/shared/schema.ts"
import { TableId } from "@/core/modules/table/table-types.ts"

export const payment = {
  id: PaymentId,
  deviceId: DeviceId.nullable(),
  billId: BillId.nullable(),
  tableId: TableId.nullable(),
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  tipAmount: NonNegativeIntegerSchema,
  canceledAt: TimestampMsSchema.nullable(),
} as const

export const paymentCashRegister = {
  id: PaymentId,
  accountId: AccountId,
} as const

export const paymentBtc = {
  id: PaymentId,
  accountId: AccountId,
  amountSats: NonNegativeIntegerSchema,
  exchangeRate: PositiveNumberSchema,
  exchangeRateSource: z.enum(["yadio"]),
  exchangeRateFetchedAt: TimestampMsSchema,
} as const

export const paymentBtcLightning = {
  id: PaymentId,
  lnInvoice: NonEmptyStringSchema,
  lightningReceiveRequestId: NonEmptyStringSchema.nullable(),
  paymentHash: NonEmptyStringSchema.nullable(),
  paymentPreimage: NonEmptyStringSchema.nullable(),
} as const

export const paymentBtcSpark = {
  id: PaymentId,
  sparkInvoice: NonEmptyStringSchema,
} as const

export const paymentIban = {
  id: PaymentId,
  accountId: AccountId,
  variableSymbol: VariableSymbolSchema.nullable(),
  specificSymbol: SpecificSymbolSchema.nullable(),
} as const

export const paymentIndexes = ((create) => [
  create("payment_billId").on("payment").column("billId"),
  create("payment_tableId").on("payment").column("tableId"),
  create("payment_createdAt").on("payment").column("createdAt"),
  create("paymentCashRegister_accountId")
    .on("paymentCashRegister")
    .column("accountId"),
  create("paymentBtc_accountId").on("paymentBtc").column("accountId"),
  create("paymentBtcLightning_lnInvoice")
    .on("paymentBtcLightning")
    .column("lnInvoice"),
  create("paymentBtcSpark_sparkInvoice")
    .on("paymentBtcSpark")
    .column("sparkInvoice"),
  create("paymentIban_accountId").on("paymentIban").column("accountId"),
  create("paymentIban_variableSymbol")
    .on("paymentIban")
    .column("variableSymbol"),
]) satisfies IndexesConfig

export type PaymentRow = InferTable<typeof payment>
export type PaymentCashRegisterRow = InferTable<typeof paymentCashRegister>
export type PaymentBtcRow = InferTable<typeof paymentBtc>
export type PaymentBtcLightningRow = InferTable<typeof paymentBtcLightning>
export type PaymentBtcSparkRow = InferTable<typeof paymentBtcSpark>
export type PaymentIbanRow = InferTable<typeof paymentIban>
