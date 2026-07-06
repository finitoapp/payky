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
