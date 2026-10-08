import { z } from "zod"

import { AccountId } from "@/core/modules/account/account-types.ts"
import {
  TipFixedAmountsSchema,
  TipPercentagesSchema,
} from "@/core/modules/app-settings/app-settings-tips.ts"
import { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  BankQrFormatSchema,
  CurrencySchema,
  DateStringSchema,
  FiatCurrencySchema,
  IbanSchema,
  IntegerSchema,
  NonEmptyString255Schema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  PositiveNumberSchema,
  Sha256HexSchema,
  SparkIdentityPubkeySchema,
  SpecificSymbolSchema,
  TimestampMsSchema,
  VariableSymbolSchema,
} from "@/core/modules/shared/schema.ts"
import { jsonCodec } from "@/zod-utils.ts"
import { StationId } from "./station-types.ts"

/**
 * The rumor kind of every station message. App-private: it only ever travels
 * inside a NIP-59 gift wrap, so no relay or client sees it.
 */
export const stationRumorKind = 9_059

/** Keeps a wrapped message well under relays' event size limits. */
export const MAX_REPORTS_PER_MESSAGE = 5

export const StationPaymentMethodSchema = z.enum([
  "cashRegister",
  "iban",
  "spark",
])
export type StationPaymentMethod = z.output<typeof StationPaymentMethodSchema>

/**
 * What a station runs on, built by the owner (station/0008). Sent as JSON
 * whose hash names it, so the station applies exactly what was hashed.
 */
export const StationConfigSchema = z.object({
  stationId: StationId,
  name: NonEmptyString255Schema,
  number: PositiveIntegerSchema,
  currency: FiatCurrencySchema,
  employees: z.array(
    z.object({ id: EmployeeId, name: NonEmptyString255Schema })
  ),
  tips: z.object({
    enabled: z.boolean(),
    percentages: TipPercentagesSchema,
    fixedAmounts: TipFixedAmountsSchema,
  }),
  paymentMethodOrder: z.array(StationPaymentMethodSchema),
  cash: z
    .object({ accountId: AccountId, currency: FiatCurrencySchema })
    .nullable(),
  iban: z
    .object({
      accountId: AccountId,
      iban: IbanSchema,
      currency: FiatCurrencySchema,
      name: NonEmptyString255Schema,
      defaultQrFormat: BankQrFormatSchema,
    })
    .nullable(),
  spark: z
    .object({
      accountId: AccountId,
      receiverIdentityPubkey: SparkIdentityPubkeySchema,
    })
    .nullable(),
})
export type StationConfig = z.output<typeof StationConfigSchema>
export const StationConfigJson = jsonCodec(StationConfigSchema)

export const StationSettlementSchema = z.object({
  kind: StationPaymentMethodSchema,
  amount: IntegerSchema,
  currency: CurrencySchema,
  occurredAt: TimestampMsSchema,
  sparkTransferId: NonEmptyStringSchema.nullable(),
  preimage: NonEmptyStringSchema.nullable(),
})
export type StationSettlement = z.output<typeof StationSettlementSchema>

/** One payment as the station reports it (station/0004, station/0009). */
export const StationPaymentSnapshotSchema = z.object({
  paymentId: PaymentId,
  stationId: StationId,
  employeeId: EmployeeId.nullable(),
  createdAt: TimestampMsSchema,
  amount: NonNegativeIntegerSchema,
  currency: FiatCurrencySchema,
  tipAmount: NonNegativeIntegerSchema,
  canceledAt: TimestampMsSchema.nullable(),
  expiresAt: TimestampMsSchema.nullable(),
  number: z
    .object({
      serialNumber: NonNegativeIntegerSchema,
      date: DateStringSchema.nullable(),
    })
    .nullable(),
  cash: z
    .object({
      accountId: AccountId,
      receivedAmount: NonNegativeIntegerSchema.nullable(),
    })
    .nullable(),
  iban: z
    .object({
      accountId: AccountId,
      variableSymbol: VariableSymbolSchema.nullable(),
      specificSymbol: SpecificSymbolSchema.nullable(),
    })
    .nullable(),
  spark: z
    .object({
      accountId: AccountId,
      amountSats: NonNegativeIntegerSchema,
      exchangeRate: PositiveNumberSchema,
      exchangeRateSource: z.enum(["yadio"]),
      exchangeRateFetchedAt: TimestampMsSchema,
      lnInvoice: NonEmptyStringSchema,
      lightningReceiveRequestId: NonEmptyStringSchema.nullable(),
      paymentHash: NonEmptyStringSchema.nullable(),
    })
    .nullable(),
  settlements: z.array(StationSettlementSchema),
})
export type StationPaymentSnapshot = z.output<
  typeof StationPaymentSnapshotSchema
>
export const StationPaymentSnapshotJson = jsonCodec(
  StationPaymentSnapshotSchema
)

const StationReportMessageItemSchema = z.object({
  seq: PositiveIntegerSchema,
  prevHash: Sha256HexSchema,
  hash: Sha256HexSchema,
  /** The snapshot JSON exactly as hashed. */
  payload: z.string(),
})
export type StationReportMessageItem = z.output<
  typeof StationReportMessageItemSchema
>

const StationReportAckSchema = z.object({
  seq: PositiveIntegerSchema,
  hash: Sha256HexSchema,
})
export type StationReportAck = z.output<typeof StationReportAckSchema>

export const StationToOwnerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(1),
    type: z.literal("reports"),
    configHash: Sha256HexSchema.nullable(),
    lastSeq: NonNegativeIntegerSchema,
    reports: z.array(StationReportMessageItemSchema),
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("status"),
    configHash: Sha256HexSchema.nullable(),
    lastSeq: NonNegativeIntegerSchema,
    undeliveredCount: NonNegativeIntegerSchema,
  }),
])
export type StationToOwnerMessage = z.output<typeof StationToOwnerMessageSchema>
export const StationToOwnerMessageJson = jsonCodec(StationToOwnerMessageSchema)

export const OwnerToStationMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(1),
    type: z.literal("ack"),
    reports: z.array(StationReportAckSchema),
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("config"),
    version: NonNegativeIntegerSchema,
    hash: Sha256HexSchema,
    configJson: z.string(),
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("settled"),
    paymentId: PaymentId,
    method: z.enum(["iban", "spark"]),
    occurredAt: TimestampMsSchema,
    sparkTransferId: NonEmptyStringSchema.nullable(),
  }),
  z.object({ v: z.literal(1), type: z.literal("revoked") }),
])
export type OwnerToStationMessage = z.output<typeof OwnerToStationMessageSchema>
export const OwnerToStationMessageJson = jsonCodec(OwnerToStationMessageSchema)

/**
 * Message JSON going out. One way, so plain `JSON.stringify`: the receiving
 * side decodes it with the matching `*Json` codec.
 */
export const encodeStationMessage = (
  message:
    | z.input<typeof StationToOwnerMessageSchema>
    | z.input<typeof OwnerToStationMessageSchema>
): string => JSON.stringify(message)
