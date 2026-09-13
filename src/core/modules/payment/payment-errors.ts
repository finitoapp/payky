import type { FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type {
  YadioApiError,
  YadioHttpError,
} from "@/core/integrations/yadio/yadio-client.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type {
  BillNotFoundError,
  BillStatusNotAllowedError,
} from "@/core/modules/bill/bill-guards.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import type { PaymentId } from "./payment-types.ts"

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

export const createAccountCurrencyMismatchError = defineError(
  "AccountCurrencyMismatch"
)<{
  readonly accountKind: "cashRegister" | "iban"
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

export type PreparePaymentMethodError =
  | PaymentNotFoundError
  | ZeroAmountNotPayableError
  | CashRegisterAccountNotFoundError
  | AccountCurrencyMismatchError
  | AccountSparkNotFoundError
  | IbanAccountNotFoundError
  | PaymentNumberNotFoundError
  | PaymentPreparationFailedError
  | YadioHttpError
  | YadioApiError
  | FetchError
