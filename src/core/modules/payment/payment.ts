import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { AccountId } from "@/core/modules/account/account-types.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
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
  confirmedPaidAt: TimestampMsSchema.nullable(),
  /**
   * Set once, never cleared, by `acknowledgePaymentExcessSettlement`.
   * Staff's explicit resolution of the duplicate-settlement collision: two
   * offline devices can each independently claim the same payment through a
   * different method (e.g. one settles it in cash while another
   * reconciles an incoming bank transfer for the same amount) — both
   * claims are real money, so neither is discarded, but the payment ends
   * up claimed for more than its own `amount`. This field records that
   * staff has seen the excess and decided how to handle it (e.g. refund),
   * silencing the warning. See docs/bill-payment-states.md.
   */
  excessAcknowledgedAt: TimestampMsSchema.nullable(),
  expiresAt: TimestampMsSchema.nullable(),
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

/**
 * A card payment taken on the SwitchioPay terminal.
 *
 * `transactionId` is the ECR request id this app generates and writes
 * *before* handing control to SwitchioPay, so a payment whose result never
 * makes it back (Android can kill this WebView while the terminal app is in
 * the foreground) can still be matched against the terminal's own records.
 * It stays `null` until the first attempt is launched, and is replaced on
 * every retry.
 *
 * `unresolvedTransactionId` is set to the same id before the intent leaves
 * and cleared once the terminal gives a definite answer. While it is set, the
 * last attempt's outcome is unknown — the result was unreadable, or never
 * came back — and the card may have been charged, so
 * `payPaymentWithSwitchioCard` refuses another attempt until staff has
 * checked SwitchioPay and explicitly retries.
 *
 * The result fields are what the ECR v8 transaction result carries for
 * tracing a transaction with the acquirer; everything else the terminal
 * returns (EMV data, tokens, DCC) is deliberately dropped. See
 * `src/core/native/switchio.ts`.
 */
export const paymentCardSwitchio = {
  id: PaymentId,
  accountId: AccountId,
  transactionId: NonEmptyString255Schema.nullable(),
  unresolvedTransactionId: NonEmptyString255Schema.nullable(),
  responseCode: NonEmptyString255Schema.nullable(),
  authCode: NonEmptyString255Schema.nullable(),
  sequenceNumber: NonEmptyString255Schema.nullable(),
  maskedPan: NonEmptyString255Schema.nullable(),
  cardLabel: NonEmptyString255Schema.nullable(),
  terminalId: NonEmptyString255Schema.nullable(),
  terminalDateTime: NonEmptyString255Schema.nullable(),
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
  create("paymentCardSwitchio_accountId")
    .on("paymentCardSwitchio")
    .column("accountId"),
  create("paymentCardSwitchio_transactionId")
    .on("paymentCardSwitchio")
    .column("transactionId"),
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
export type PaymentCardSwitchioRow = InferTable<typeof paymentCardSwitchio>
