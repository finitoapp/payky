import { SqliteBoolean } from "@evolu/common"
import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  EetAttemptResultSchema,
  EetBase64Schema,
  EetCashRegisterIdSchema,
  EetCertificateId,
  EetDateTimeSchema,
  EetEicSchema,
  EetEnvironmentSchema,
  EetEstablishmentIdSchema,
  EetReversalId,
  EetSaleId,
  EetSequenceNumberSchema,
  EetSettingsId,
  EetTipOwnerSchema,
  EetUnsupportedReasonSchema,
} from "@/core/modules/eet/eet-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { RefundId } from "@/core/modules/refund/refund-types.ts"
import {
  AccountKindSchema,
  FiatCurrencySchema,
  type InferTable,
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"

export const eetSettings = {
  id: EetSettingsId,
  enabledAt: TimestampMsSchema.nullable(),
  environment: EetEnvironmentSchema.nullable(),
  establishmentId: EetEstablishmentIdSchema.nullable(),
  certificateId: EetCertificateId.nullable(),
  tipOwner: EetTipOwnerSchema.nullable(),
} as const

export const eetCertificate = {
  id: EetCertificateId,
  eic: EetEicSchema,
  description: NonEmptyString255Schema.nullable(),
  validFrom: TimestampMsSchema,
  validTo: TimestampMsSchema,
  certificateDer: EetBase64Schema,
  privateKeyPkcs8: EetBase64Schema,
  isTestCertificate: SqliteBoolean,
} as const

export const eetSale = {
  id: EetSaleId,
  paymentId: PaymentId,
  billId: BillId.nullable(),
  deviceId: DeviceId,
  method: AccountKindSchema,
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  environment: EetEnvironmentSchema,
  eic: EetEicSchema,
  establishmentId: EetEstablishmentIdSchema,
  cashRegisterId: EetCashRegisterIdSchema,
  sequenceNumber: EetSequenceNumberSchema,
  saleAt: EetDateTimeSchema,
  unsupportedReason: EetUnsupportedReasonSchema.nullable(),
  hadUnansweredAttempt: SqliteBoolean,
  attemptStartedAt: TimestampMsSchema.nullable(),
  lastAttemptAt: TimestampMsSchema.nullable(),
  lastAttemptResult: EetAttemptResultSchema.nullable(),
  lastErrorType: NonEmptyString255Schema.nullable(),
  lastErrorCode: IntegerSchema.nullable(),
  lastErrorMessage: NonEmptyStringSchema.nullable(),
  lastGlobalTransactionId: NonEmptyString255Schema.nullable(),
} as const

export const eetSaleConfirmation = {
  id: EetSaleId,
  pok: NonEmptyString255Schema,
  receivedAt: EetDateTimeSchema,
  isTest: SqliteBoolean,
  warningsJson: z.string(),
  messageUuid: NonEmptyString255Schema,
  globalTransactionId: NonEmptyString255Schema.nullable(),
} as const

export const eetReversal = {
  id: EetReversalId,
  refundId: RefundId,
  saleId: EetSaleId,
  paymentId: PaymentId,
  deviceId: DeviceId,
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  environment: EetEnvironmentSchema,
  eic: EetEicSchema,
  establishmentId: EetEstablishmentIdSchema,
  cashRegisterId: EetCashRegisterIdSchema,
  sequenceNumber: EetSequenceNumberSchema,
  saleAt: EetDateTimeSchema,
  unsupportedReason: EetUnsupportedReasonSchema.nullable(),
  hadUnansweredAttempt: SqliteBoolean,
  attemptStartedAt: TimestampMsSchema.nullable(),
  lastAttemptAt: TimestampMsSchema.nullable(),
  lastAttemptResult: EetAttemptResultSchema.nullable(),
  lastErrorType: NonEmptyString255Schema.nullable(),
  lastErrorCode: IntegerSchema.nullable(),
  lastErrorMessage: NonEmptyStringSchema.nullable(),
  lastGlobalTransactionId: NonEmptyString255Schema.nullable(),
} as const

export const eetReversalConfirmation = {
  id: EetReversalId,
  pok: NonEmptyString255Schema,
  receivedAt: EetDateTimeSchema,
  isTest: SqliteBoolean,
  warningsJson: z.string(),
  messageUuid: NonEmptyString255Schema,
  globalTransactionId: NonEmptyString255Schema.nullable(),
} as const

export const eetIndexes = ((create) => [
  create("eetSale_paymentId").on("eetSale").column("paymentId"),
  create("eetSale_deviceId").on("eetSale").column("deviceId"),
  create("eetReversal_refundId").on("eetReversal").column("refundId"),
  create("eetReversal_saleId").on("eetReversal").column("saleId"),
  create("eetReversal_paymentId").on("eetReversal").column("paymentId"),
  create("eetReversal_deviceId").on("eetReversal").column("deviceId"),
]) satisfies IndexesConfig

export type EetSettingsRow = InferTable<typeof eetSettings>
export type EetCertificateRow = InferTable<typeof eetCertificate>
export type EetSaleRow = InferTable<typeof eetSale>
export type EetSaleConfirmationRow = InferTable<typeof eetSaleConfirmation>
export type EetReversalRow = InferTable<typeof eetReversal>
