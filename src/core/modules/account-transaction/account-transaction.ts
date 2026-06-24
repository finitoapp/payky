import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { AccountId } from "@/core/modules/account/account-types.ts"
import {
  AccountTransactionId,
  AccountTransactionSourceId,
} from "@/core/modules/account-transaction/account-transaction-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  AccountKindSchema,
  ConstantSymbolSchema,
  CurrencySchema,
  type InferTable,
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  SpecificSymbolSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "@/core/modules/shared/schema.ts"

export const AccountTransactionSourceSchema = z.enum(["manual", "auto"])

export const accountTransaction = {
  id: AccountTransactionId,
  accountId: AccountId,
  kind: AccountKindSchema,
  amount: IntegerSchema,
  currency: CurrencySchema,
  occurredAt: TimestampMsSchema,
  note: NonEmptyStringSchema.nullable(),
  internalTransferGroupId: NonEmptyString255Schema.nullable(),
} as const

export const accountTransactionIban = {
  id: AccountTransactionId,
  variableSymbol: VariableSymbolSchema.nullable(),
  constantSymbol: ConstantSymbolSchema.nullable(),
  specificSymbol: SpecificSymbolSchema.nullable(),
  bankReference: NonEmptyString255Schema.nullable(),
} as const

export const accountTransactionSpark = {
  id: AccountTransactionId,
  sparkTransferId: NonEmptyStringSchema,
  lnInvoice: NonEmptyStringSchema.nullable(),
  sparkInvoice: NonEmptyStringSchema.nullable(),
  preImage: NonEmptyStringSchema.nullable(),
  paymentHash: NonEmptyStringSchema.nullable(),
} as const

export const accountTransactionSource = {
  id: AccountTransactionSourceId,
  deviceId: DeviceId.nullable(),
  accountTransactionId: AccountTransactionId,
  source: AccountTransactionSourceSchema,
  recordedAt: TimestampMsSchema,
} as const

export const accountTransactionIndexes = ((create) => [
  create("accountTransaction_accountId")
    .on("accountTransaction")
    .column("accountId"),
  create("accountTransaction_accountId_occurredAt")
    .on("accountTransaction")
    .columns(["accountId", "occurredAt"]),
  create("accountTransaction_internalTransferGroupId")
    .on("accountTransaction")
    .column("internalTransferGroupId"),
  create("accountTransactionSpark_sparkTransferId")
    .on("accountTransactionSpark")
    .column("sparkTransferId"),
  create("accountTransactionSpark_lnInvoice")
    .on("accountTransactionSpark")
    .column("lnInvoice"),
  create("accountTransactionSpark_sparkInvoice")
    .on("accountTransactionSpark")
    .column("sparkInvoice"),
  create("accountTransactionIban_bankReference")
    .on("accountTransactionIban")
    .column("bankReference"),
  create("accountTransactionSource_accountTransactionId")
    .on("accountTransactionSource")
    .column("accountTransactionId"),
  create("accountTransactionSource_source")
    .on("accountTransactionSource")
    .column("source"),
]) satisfies IndexesConfig

export type AccountTransactionSource = z.output<
  typeof AccountTransactionSourceSchema
>
export type AccountTransactionRow = InferTable<typeof accountTransaction>
export type AccountTransactionIbanRow = InferTable<
  typeof accountTransactionIban
>
export type AccountTransactionSparkRow = InferTable<
  typeof accountTransactionSpark
>
export type AccountTransactionSourceRow = InferTable<
  typeof accountTransactionSource
>
