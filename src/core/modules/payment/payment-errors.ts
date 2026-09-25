import type { FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { RedeemLnurlWithdrawError } from "@/core/integrations/lnurl/lnurl-withdraw-client.ts"
import type {
  YadioApiError,
  YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type {
  BillNotFoundError,
  BillStatusNotAllowedError,
} from "@/core/modules/bill/bill-guards.ts"
import type {
  FiatCurrency,
  NonEmptyString255,
} from "@/core/modules/shared/schema.ts"
import type { SwitchioPaymentError } from "@/core/native/switchio.ts"
import type { PaymentStatus } from "./payment-status-utils.ts"
import type { PaymentId } from "./payment-types.ts"

/**
 * The account kinds a payment can be settled against and whose currency must
 * therefore match the payment's own. Spark is absent on purpose: a BTC
 * wallet has no fiat currency to compare.
 */
export type PaymentAccountKind = "cashRegister" | "iban" | "cardSwitchio"

export type CreatePaymentError = BillNotFoundError | BillStatusNotAllowedError

export const createPaymentNotFoundError = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof createPaymentNotFoundError>

export const createPaymentAlreadyPaidError = defineError("PaymentAlreadyPaid")<{
  readonly id: PaymentId
}>()
export type PaymentAlreadyPaidError = ReturnType<
  typeof createPaymentAlreadyPaidError
>

export const createPaymentNotCanceledError = defineError("PaymentNotCanceled")<{
  readonly id: PaymentId
}>()
export type PaymentNotCanceledError = ReturnType<
  typeof createPaymentNotCanceledError
>

export const createPaymentNotClaimedError = defineError("PaymentNotClaimed")<{
  readonly id: PaymentId
}>()
export type PaymentNotClaimedError = ReturnType<
  typeof createPaymentNotClaimedError
>

export const createPaymentNotOverpaidError = defineError("PaymentNotOverpaid")<{
  readonly id: PaymentId
}>()
export type PaymentNotOverpaidError = ReturnType<
  typeof createPaymentNotOverpaidError
>

export const createAccountSparkNotFoundError = defineError(
  "AccountSparkNotFound"
)<{
  readonly id: AccountId
}>()
export type AccountSparkNotFoundError = ReturnType<
  typeof createAccountSparkNotFoundError
>

export const createPaymentPreparationFailedError = defineError(
  "PaymentPreparationFailed"
)<{
  readonly message: string
}>()
export type PaymentPreparationFailedError = ReturnType<
  typeof createPaymentPreparationFailedError
>

export const createZeroAmountNotPayableError = defineError(
  "ZeroAmountNotPayable"
)<{
  readonly amount: number
}>()
export type ZeroAmountNotPayableError = ReturnType<
  typeof createZeroAmountNotPayableError
>

export const createPaymentNumberNotFoundError = defineError(
  "PaymentNumberNotFound"
)<{
  readonly paymentId: PaymentId
}>()
export type PaymentNumberNotFoundError = ReturnType<
  typeof createPaymentNumberNotFoundError
>

export const createCashRegisterAccountNotFoundError = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof createCashRegisterAccountNotFoundError
>

export const createIbanAccountNotFoundError = defineError(
  "IbanAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type IbanAccountNotFoundError = ReturnType<
  typeof createIbanAccountNotFoundError
>

export const createCardSwitchioAccountNotFoundError = defineError(
  "CardSwitchioAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CardSwitchioAccountNotFoundError = ReturnType<
  typeof createCardSwitchioAccountNotFoundError
>

export const createAccountCurrencyMismatchError = defineError(
  "AccountCurrencyMismatch"
)<{
  readonly accountKind: PaymentAccountKind
  readonly id: AccountId
  readonly accountCurrency: FiatCurrency
  readonly paymentCurrency: FiatCurrency
}>()
export type AccountCurrencyMismatchError = ReturnType<
  typeof createAccountCurrencyMismatchError
>

export type CreatePreparedPaymentError =
  | AccountSparkNotFoundError
  | ZeroAmountNotPayableError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError
  | CreatePaymentError

export type MarkPaymentPaidCashError =
  | PaymentNotFoundError
  | CashRegisterAccountNotFoundError
  | AccountCurrencyMismatchError

export type MarkPaymentPaidIbanError =
  | PaymentNotFoundError
  | IbanAccountNotFoundError
  | AccountCurrencyMismatchError

/**
 * A card payment was requested for a payment that can no longer take money
 * — already paid (possibly through another method on the same payment),
 * canceled or expired. Raised before the terminal is asked, so no card is
 * charged.
 */
export const createPaymentNotPayableError = defineError("PaymentNotPayable")<{
  readonly id: PaymentId
  readonly status: Exclude<PaymentStatus, "pending">
}>()
export type PaymentNotPayableError = ReturnType<
  typeof createPaymentNotPayableError
>

/**
 * The previous terminal attempt's outcome is unknown, so the card may have
 * been charged already. Another attempt needs staff to have checked
 * SwitchioPay first and to retry explicitly.
 */
export const createSwitchioAttemptUnresolvedError = defineError(
  "SwitchioAttemptUnresolved"
)<{
  readonly id: PaymentId
  readonly transactionId: NonEmptyString255
}>()
export type SwitchioAttemptUnresolvedError = ReturnType<
  typeof createSwitchioAttemptUnresolvedError
>

/**
 * A SwitchioPay result restored after an app restart names no request id
 * this device launched — or none at all — so it cannot be tied to a payment.
 */
export const createSwitchioRestoredResultUnmatchedError = defineError(
  "SwitchioRestoredResultUnmatched"
)<{
  readonly transactionId: string | null
}>()
export type SwitchioRestoredResultUnmatchedError = ReturnType<
  typeof createSwitchioRestoredResultUnmatchedError
>

export type PayPaymentWithSwitchioCardError =
  | PaymentNotFoundError
  | PaymentNotPayableError
  | SwitchioAttemptUnresolvedError
  | CardSwitchioAccountNotFoundError
  | AccountCurrencyMismatchError
  | SwitchioPaymentError

/**
 * A Bolt Card was tapped for a payment with no Lightning invoice — a Spark
 * invoice alone cannot be handed to an LNURL-withdraw service.
 */
export const createPaymentLightningInvoiceNotFoundError = defineError(
  "PaymentLightningInvoiceNotFound"
)<{
  readonly id: PaymentId
}>()
export type PaymentLightningInvoiceNotFoundError = ReturnType<
  typeof createPaymentLightningInvoiceNotFoundError
>

export type PayPaymentWithBoltCardError =
  | PaymentNotFoundError
  | PaymentNotPayableError
  | PaymentLightningInvoiceNotFoundError
  | RedeemLnurlWithdrawError

export type SettleRestoredSwitchioCardPaymentError =
  | SwitchioRestoredResultUnmatchedError
  | PaymentNotFoundError
  | CardSwitchioAccountNotFoundError
  | AccountCurrencyMismatchError
  | SwitchioPaymentError

export type PreparePaymentMethodError =
  | PaymentNotFoundError
  | ZeroAmountNotPayableError
  | CashRegisterAccountNotFoundError
  | CardSwitchioAccountNotFoundError
  | AccountCurrencyMismatchError
  | AccountSparkNotFoundError
  | IbanAccountNotFoundError
  | PaymentNumberNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError
