import { AccountId } from "@/modules/account/account-types.ts"
import { AccountTransactionId } from "@/modules/account-transaction/account-transaction-types.ts"
import { DeviceId } from "@/modules/device/device-types.ts"
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
} from "@/modules/shared/schema.ts"

export const accountTransaction = {
  id: AccountTransactionId,
  deviceId: DeviceId.nullable(),
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
  lnInvoice: NonEmptyStringSchema,
  preImage: NonEmptyStringSchema,
  paymentHash: NonEmptyStringSchema,
} as const

export type AccountTransactionRow = InferTable<typeof accountTransaction>
export type AccountTransactionIbanRow = InferTable<
  typeof accountTransactionIban
>
export type AccountTransactionSparkRow = InferTable<
  typeof accountTransactionSpark
>
