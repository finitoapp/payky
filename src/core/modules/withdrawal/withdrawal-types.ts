import { defineError } from "@/core/error.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"

export const createWithdrawalAccountNotFoundError = defineError(
  "WithdrawalAccountNotFound"
)<{
  readonly accountId: AccountId
}>()
export type WithdrawalAccountNotFoundError = ReturnType<
  typeof createWithdrawalAccountNotFoundError
>

export const createInvalidBitcoinAddressError = defineError(
  "InvalidBitcoinAddress"
)<{
  readonly address: string
}>()
export type InvalidBitcoinAddressError = ReturnType<
  typeof createInvalidBitcoinAddressError
>

export const createInsufficientWithdrawalBalanceError = defineError(
  "InsufficientWithdrawalBalance"
)<{
  readonly availableSats: number
  readonly requestedSats: number
}>()
export type InsufficientWithdrawalBalanceError = ReturnType<
  typeof createInsufficientWithdrawalBalanceError
>

export const createWithdrawalQuoteFailedError = defineError(
  "WithdrawalQuoteFailed"
)<{
  readonly message: string
}>()
export type WithdrawalQuoteFailedError = ReturnType<
  typeof createWithdrawalQuoteFailedError
>

export const createWithdrawalFailedError = defineError("WithdrawalFailed")<{
  readonly message: string
}>()
export type WithdrawalFailedError = ReturnType<
  typeof createWithdrawalFailedError
>

export const createWithdrawalRequestFailedError = defineError(
  "WithdrawalRequestFailed"
)<{
  readonly message: string
}>()
export type WithdrawalRequestFailedError = ReturnType<
  typeof createWithdrawalRequestFailedError
>

export const createWithdrawalRecordingFailedError = defineError(
  "WithdrawalRecordingFailed"
)<{
  readonly message: string
}>()
export type WithdrawalRecordingFailedError = ReturnType<
  typeof createWithdrawalRecordingFailedError
>

export type ExecuteWithdrawalFailureError =
  | WithdrawalRequestFailedError
  | WithdrawalRecordingFailedError

export type QuoteWithdrawalError =
  | WithdrawalAccountNotFoundError
  | InvalidBitcoinAddressError
  | InsufficientWithdrawalBalanceError
  | WithdrawalQuoteFailedError

export type ExecuteWithdrawalError =
  | WithdrawalAccountNotFoundError
  | ExecuteWithdrawalFailureError
