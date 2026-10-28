import { defineError } from "../../error.ts"
import type { CashuOperationId, KeysetId, MintUrl } from "./cashu-types.ts"

/**
 * The errors the Cashu wallet's Tasks raise across files (`cashu/cashu-
 * wallet.ts` and the `cashu-*-actions.ts`), with the unions they share.
 */

/** The mint could not be reached, or answered 5xx: worth trying again. */
export const createMintUnreachableError = defineError("MintUnreachable")<{
  readonly mint: MintUrl
  readonly detail: string
}>()
export type MintUnreachableError = ReturnType<typeof createMintUnreachableError>

/** The mint gave a definitive answer against the call. */
export const createMintRejectedError = defineError("MintRejected")<{
  readonly mint: MintUrl
  readonly code: number | null
  readonly detail: string
  /** Set when the mint listed a keyset that belongs to this other mint. */
  readonly keysetOwner?: MintUrl
}>()
export type MintRejectedError = ReturnType<typeof createMintRejectedError>

export type MintFailure = MintUnreachableError | MintRejectedError

export const createCounterLockTimeoutError = defineError("CounterLockTimeout")<{
  readonly mint: MintUrl
  readonly keysetId: KeysetId
}>()
export type CounterLockTimeoutError = ReturnType<
  typeof createCounterLockTimeoutError
>

export const createQuoteExpiredError = defineError("QuoteExpired")<{
  readonly mint: MintUrl
  readonly quoteId: string
}>()
export type QuoteExpiredError = ReturnType<typeof createQuoteExpiredError>

export const createTokenLockedError = defineError("TokenLocked")<{
  readonly detail: string
}>()
export type TokenLockedError = ReturnType<typeof createTokenLockedError>

export const createTokenUndecodableError = defineError("TokenUndecodable")()
export type TokenUndecodableError = ReturnType<
  typeof createTokenUndecodableError
>

export const createTokenAlreadyKnownError = defineError("TokenAlreadyKnown")()
export type TokenAlreadyKnownError = ReturnType<
  typeof createTokenAlreadyKnownError
>

export const createAmountConsumedByFeeError = defineError(
  "AmountConsumedByFee"
)<{
  readonly amount: number
  readonly fee: number
}>()
export type AmountConsumedByFeeError = ReturnType<
  typeof createAmountConsumedByFeeError
>

export const createCashuInsufficientFundsError = defineError(
  "CashuInsufficientFunds"
)<{
  readonly mint: MintUrl
  readonly needed: number
  readonly available: number
}>()
export type CashuInsufficientFundsError = ReturnType<
  typeof createCashuInsufficientFundsError
>

export const createCashuMeltQuoteNotPayableError = defineError(
  "CashuMeltQuoteNotPayable"
)<{
  readonly mint: MintUrl
  readonly state: string
}>()
export type CashuMeltQuoteNotPayableError = ReturnType<
  typeof createCashuMeltQuoteNotPayableError
>

/** The mint refused the invoice or the inputs came back: nothing was paid. */
export const createCashuMeltUnpaidError = defineError("CashuMeltUnpaid")<{
  readonly mint: MintUrl
}>()
export type CashuMeltUnpaidError = ReturnType<typeof createCashuMeltUnpaidError>

/** Sent, but the mint has not settled it yet: the melt stays pending. */
export const createCashuMeltPendingError = defineError("CashuMeltPending")<{
  readonly mint: MintUrl
  readonly operationId: CashuOperationId
}>()
export type CashuMeltPendingError = ReturnType<
  typeof createCashuMeltPendingError
>

export const createCashuNothingToMoveError = defineError("CashuNothingToMove")<{
  readonly mint: MintUrl
}>()
export type CashuNothingToMoveError = ReturnType<
  typeof createCashuNothingToMoveError
>

export const createCashuMintUrlInvalidError = defineError(
  "CashuMintUrlInvalid"
)()
export type CashuMintUrlInvalidError = ReturnType<
  typeof createCashuMintUrlInvalidError
>

/** Untrusting the only trusted mint would leave no default (cashu/0016). */
export const createCashuLastTrustedMintError = defineError(
  "CashuLastTrustedMint"
)<{
  readonly mint: MintUrl
}>()
export type CashuLastTrustedMintError = ReturnType<
  typeof createCashuLastTrustedMintError
>

/** Only a trusted mint becomes the default (cashu/0013). */
export const createCashuMintNotTrustedError = defineError(
  "CashuMintNotTrusted"
)<{
  readonly mint: MintUrl
}>()
export type CashuMintNotTrustedError = ReturnType<
  typeof createCashuMintNotTrustedError
>

export type CashuTopupClaimError =
  | MintFailure
  | CounterLockTimeoutError
  | QuoteExpiredError

export type CashuReceiveError =
  | MintFailure
  | TokenLockedError
  | TokenUndecodableError
  | TokenAlreadyKnownError
  | AmountConsumedByFeeError
  | CounterLockTimeoutError

export type CashuMeltError =
  | MintFailure
  | CounterLockTimeoutError
  | QuoteExpiredError
  | CashuInsufficientFundsError
  | CashuMeltQuoteNotPayableError
  | CashuMeltUnpaidError
  | CashuMeltPendingError

export type CashuMoveError =
  | MintFailure
  | CashuNothingToMoveError
  | CashuMeltError
  | CashuTopupClaimError
