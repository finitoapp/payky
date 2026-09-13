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

export const paymentNotFound = defineError("PaymentNotFound")<{
  readonly id: PaymentId
}>()
export type PaymentNotFoundError = ReturnType<typeof paymentNotFound>

export const paymentAlreadyPaid = defineError("PaymentAlreadyPaid")<{
  readonly id: PaymentId
}>()
export type PaymentAlreadyPaidError = ReturnType<typeof paymentAlreadyPaid>

export const paymentNotCanceled = defineError("PaymentNotCanceled")<{
  readonly id: PaymentId
}>()
export type PaymentNotCanceledError = ReturnType<typeof paymentNotCanceled>

export const paymentNotClaimed = defineError("PaymentNotClaimed")<{
  readonly id: PaymentId
}>()
export type PaymentNotClaimedError = ReturnType<typeof paymentNotClaimed>

export const paymentNotOverpaid = defineError("PaymentNotOverpaid")<{
  readonly id: PaymentId
}>()
export type PaymentNotOverpaidError = ReturnType<typeof paymentNotOverpaid>

export const accountSparkNotFound = defineError("AccountSparkNotFound")<{
  readonly id: AccountId
}>()
export type AccountSparkNotFoundError = ReturnType<typeof accountSparkNotFound>

export const paymentPreparationFailed = defineError(
  "PaymentPreparationFailed"
)<{
  readonly message: string
}>()
export type PaymentPreparationFailedError = ReturnType<
  typeof paymentPreparationFailed
>

export const zeroAmountNotPayable = defineError("ZeroAmountNotPayable")<{
  readonly amount: number
}>()
export type ZeroAmountNotPayableError = ReturnType<typeof zeroAmountNotPayable>

export const paymentNumberNotFound = defineError("PaymentNumberNotFound")<{
  readonly paymentId: PaymentId
}>()
export type PaymentNumberNotFoundError = ReturnType<
  typeof paymentNumberNotFound
>

export const cashRegisterAccountNotFound = defineError(
  "CashRegisterAccountNotFound"
)<{
  readonly id: AccountId
}>()
export type CashRegisterAccountNotFoundError = ReturnType<
  typeof cashRegisterAccountNotFound
>

export const ibanAccountNotFound = defineError("IbanAccountNotFound")<{
  readonly id: AccountId
}>()
export type IbanAccountNotFoundError = ReturnType<typeof ibanAccountNotFound>

export const accountCurrencyMismatch = defineError("AccountCurrencyMismatch")<{
  readonly accountKind: "cashRegister" | "iban"
  readonly id: AccountId
  readonly accountCurrency: FiatCurrency
  readonly paymentCurrency: FiatCurrency
}>()
export type AccountCurrencyMismatchError = ReturnType<
  typeof accountCurrencyMismatch
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
