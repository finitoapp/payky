import { defineError } from "../../error.ts"
import type { CashuOperationId, KeysetId, MintUrl } from "./cashu-types.ts"

/**
 * The errors the Cashu wallet's Tasks raise across files (`cashu/cashu-
 * wallet.ts` and the `cashu-*-actions.ts`), with the unions they share.
 */

/**
 * The call's outcome is unknown: the mint could not be reached, or did not
 * answer with its word (a 5xx, an answer that would not be read). Worth
 * trying again; never a refusal (cashu/0029).
 */
export const createMintUnreachableError = defineError("MintUnreachable")<{
  readonly mint: MintUrl
  readonly detail: string
}>()
export type MintUnreachableError = ReturnType<typeof createMintUnreachableError>

/**
 * The mint gave a definitive answer against the call: a NUT-00 code, or a
 * check of Payky's own on what it answered.
 */
export const createMintRejectedError = defineError("MintRejected")<{
  readonly mint: MintUrl
  readonly code: number | null
  readonly detail: string
  /** Set when the mint listed a keyset that belongs to this other mint. */
  readonly keysetOwner?: MintUrl
}>()
export type MintRejectedError = ReturnType<typeof createMintRejectedError>

/**
 * The mint does not list what Payky's wallet stands on (cashu/0033): NUT-07
 * to tell spent proofs from unspent, NUT-09 to restore signed outputs.
 */
export const createCashuMintUnsupportedError = defineError(
  "CashuMintUnsupported"
)<{
  readonly mint: MintUrl
  readonly missingNuts: ReadonlyArray<CashuRequiredNut>
}>()
export type CashuMintUnsupportedError = ReturnType<
  typeof createCashuMintUnsupportedError
>

/** The NUTs a mint must list for Payky to work with it (cashu/0033). */
export const cashuRequiredNuts = [7, 9] as const
export type CashuRequiredNut = (typeof cashuRequiredNuts)[number]

export type MintFailure =
  | MintUnreachableError
  | MintRejectedError
  | CashuMintUnsupportedError

/**
 * The mint signed slots of an operation's block that another open
 * operation's block shares, and the mint's state leaves both as ones that
 * could have signed them (cashu/0029). Tried again later; past the grace the
 * block is given to no one.
 */
export const createCashuReclaimAmbiguousError = defineError(
  "CashuReclaimAmbiguous"
)<{
  readonly mint: MintUrl
  readonly operationId: CashuOperationId
}>()
export type CashuReclaimAmbiguousError = ReturnType<
  typeof createCashuReclaimAmbiguousError
>

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

/**
 * The source's fees rose since the estimate: the move would take more than
 * the total the merchant confirmed (cashu/0023).
 */
export const createCashuMoveCostRoseError = defineError("CashuMoveCostRose")<{
  readonly mint: MintUrl
  readonly confirmed: number
  readonly needed: number
}>()
export type CashuMoveCostRoseError = ReturnType<
  typeof createCashuMoveCostRoseError
>
export type CashuNothingToMoveError = ReturnType<
  typeof createCashuNothingToMoveError
>

export const createCashuMintUrlInvalidError = defineError(
  "CashuMintUrlInvalid"
)()
export type CashuMintUrlInvalidError = ReturnType<
  typeof createCashuMintUrlInvalidError
>

/**
 * This device knows no trusted mint, so it cannot tell which mint the
 * merchant trusts: its sync has not delivered the account's mints yet
 * (cashu/0018).
 */
export const createCashuMintsNotSyncedError = defineError(
  "CashuMintsNotSynced"
)()
export type CashuMintsNotSyncedError = ReturnType<
  typeof createCashuMintsNotSyncedError
>

/**
 * The merchant asked to seed the default mint while a relay is still on its
 * way: the list it may bring is waited for, not overruled (cashu/0013).
 */
export const createCashuMintsStillSyncingError = defineError(
  "CashuMintsStillSyncing"
)()
export type CashuMintsStillSyncingError = ReturnType<
  typeof createCashuMintsStillSyncingError
>

/** Untrusting the only trusted mint would leave no default (cashu/0015). */
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

/**
 * The mint holds the token's proofs pending: another call is spending them
 * right now, another Payky device's swap or another wallet's. Not a refusal:
 * tried again later (cashu/0030).
 */
export const createTokenPendingError = defineError("TokenPending")<{
  readonly mint: MintUrl
}>()
export type TokenPendingError = ReturnType<typeof createTokenPendingError>

export type CashuTopupClaimError =
  | MintFailure
  | CounterLockTimeoutError
  | QuoteExpiredError
  | CashuReclaimAmbiguousError

export type CashuReceiveError =
  | MintFailure
  | TokenLockedError
  | TokenUndecodableError
  | TokenAlreadyKnownError
  | AmountConsumedByFeeError
  | CounterLockTimeoutError
  | CashuReclaimAmbiguousError
  | TokenPendingError

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
  | CashuMoveCostRoseError
  | CashuMeltError
  | CashuTopupClaimError
