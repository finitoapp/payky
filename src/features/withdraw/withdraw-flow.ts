import type { AbortError } from "@evolu/common"
import {
  decimalAmountToMinorUnits,
  fiatMinorUnitsToSats,
} from "@/core/modules/shared/money.ts"
import type {
  FiatCurrency,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import type {
  ExecuteWithdrawalEarlyError,
  QuoteWithdrawalError,
  SupportedWithdrawDestination,
  WithdrawalQuote,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import type { ParseWithdrawDestinationError } from "@/core/modules/withdraw/withdraw-destination-utils.ts"
import { isOnchainWithdrawAllBelowMinimum } from "@/core/modules/withdraw/withdraw-utils.ts"
import type { SparkExitSpeed } from "@/core/spark/spark-wallet.ts"
import type { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

type Translate = ReturnType<typeof useTranslation>["t"]

/** What the merchant asked for, kept so the review can fetch a new estimate. */
export interface WithdrawRequest {
  readonly destination: SupportedWithdrawDestination
  /** `undefined` means "withdraw all", or an invoice that sets its own amount. */
  readonly amountSats: PositiveInteger | undefined
}

type WithdrawState =
  | { readonly step: "form" }
  | {
      readonly step: "review"
      readonly request: WithdrawRequest
      readonly quote: WithdrawalQuote
      readonly exitSpeed: SparkExitSpeed
      /** Set from the first press until the outcome is known. */
      readonly confirming: boolean
      /** Already translated: some messages carry amounts. */
      readonly confirmError: string | null
    }

type WithdrawAction =
  | {
      readonly type: "OPEN_REVIEW"
      readonly request: WithdrawRequest
      readonly quote: WithdrawalQuote
    }
  | { readonly type: "BACK" }
  | { readonly type: "SET_EXIT_SPEED"; readonly exitSpeed: SparkExitSpeed }
  | { readonly type: "CONFIRM_STARTED" }
  | { readonly type: "CONFIRM_FAILED"; readonly error: string }
  | { readonly type: "CONFIRM_FINISHED" }
  | { readonly type: "REQUOTED"; readonly quote: WithdrawalQuote }

export const initialWithdrawState: WithdrawState = { step: "form" }

export type WithdrawReviewState = Extract<WithdrawState, { step: "review" }>

/**
 * Everything but OPEN_REVIEW/BACK is only ever dispatched from the review
 * step's UI, which only exists while `state.step === "review"`. Asserting
 * instead of silently no-op'ing on a mismatch surfaces a real bug at once.
 */
const assertReviewState = (state: WithdrawState): WithdrawReviewState => {
  if (state.step !== "review") {
    throw new Error(
      `withdrawReducer: expected step "review", got "${state.step}"`
    )
  }
  return state
}

/** `true` when the speed's fee would push an on-chain "withdraw all" under the minimum. */
export const isExitSpeedUnavailable = (
  quote: WithdrawalQuote,
  exitSpeed: SparkExitSpeed
): boolean =>
  quote.kind === "onchain" &&
  isOnchainWithdrawAllBelowMinimum({
    withdrawAll: quote.withdrawAll,
    availableSats: quote.availableSats,
    feeSats: quote.feeQuote[exitSpeed].totalFeeSats,
  })

/** The quote checked "slow" against the minimum, so it is always available. */
const availableExitSpeed = (
  quote: WithdrawalQuote,
  preferred: SparkExitSpeed
): SparkExitSpeed =>
  isExitSpeedUnavailable(quote, preferred) ? "slow" : preferred

export const withdrawReducer = (
  state: WithdrawState,
  action: WithdrawAction
): WithdrawState => {
  switch (action.type) {
    case "OPEN_REVIEW":
      return {
        step: "review",
        request: action.request,
        quote: action.quote,
        exitSpeed: availableExitSpeed(action.quote, "medium"),
        confirming: false,
        confirmError: null,
      }
    case "BACK":
      return initialWithdrawState
    case "SET_EXIT_SPEED":
      return { ...assertReviewState(state), exitSpeed: action.exitSpeed }
    case "CONFIRM_STARTED":
      return {
        ...assertReviewState(state),
        confirming: true,
        confirmError: null,
      }
    case "CONFIRM_FAILED":
      return {
        ...assertReviewState(state),
        confirming: false,
        confirmError: action.error,
      }
    case "CONFIRM_FINISHED":
      return { ...assertReviewState(state), confirming: false }
    case "REQUOTED": {
      const review = assertReviewState(state)
      return {
        ...review,
        quote: action.quote,
        exitSpeed: availableExitSpeed(action.quote, review.exitSpeed),
        confirming: false,
        confirmError: null,
      }
    }
  }
}

const lightningAddressUnavailable = "withdraw.error.lightningAddressUnavailable"

const fixedQuoteErrorKeys = {
  AbortError: "withdraw.quoteError.generic",
  WithdrawalAccountNotFound: "withdraw.error.accountNotFound",
  WithdrawalAmountRequired: "withdraw.amount.invalid",
  WithdrawalQuoteFailed: "withdraw.quoteError.generic",
  SelfWithdrawal: "withdraw.error.selfWithdrawal",
  LightningInvoiceExpired: "withdraw.error.lightningInvoiceExpired",
  LightningAddressInvoiceMismatch: "withdraw.error.lightningAddressMismatch",
  LnurlRequestError: lightningAddressUnavailable,
  LnurlHttpError: lightningAddressUnavailable,
  LnurlResponseError: lightningAddressUnavailable,
  FetchError: lightningAddressUnavailable,
} satisfies Record<
  Exclude<
    (QuoteWithdrawalError | AbortError)["type"],
    | "InsufficientWithdrawalBalance"
    | "WithdrawalAmountOutOfRange"
    | "WithdrawalBelowMinimum"
  >,
  TranslationKey
>

export const quoteErrorMessage = (
  error: QuoteWithdrawalError | AbortError,
  t: Translate
): string => {
  switch (error.type) {
    case "WithdrawalBelowMinimum":
      return t("withdraw.error.belowMinimum", { amount: error.minSats })
    case "InsufficientWithdrawalBalance":
      return error.maxSendableSats === undefined
        ? t("withdraw.error.insufficientBalance")
        : t("withdraw.error.insufficientBalanceMax", {
            amount: error.maxSendableSats,
          })
    case "WithdrawalAmountOutOfRange":
      return t("withdraw.error.amountOutOfRange", {
        min: error.minSats,
        max: error.maxSats,
      })
    default:
      return t(fixedQuoteErrorKeys[error.type])
  }
}

/** Errors from before anything was recorded: the review stays open. */
export const earlyConfirmErrorKeys = {
  AbortError: "withdraw.review.error.interrupted",
  WithdrawalAccountNotFound: "withdraw.error.accountNotFound",
  InsufficientWithdrawalBalance: "withdraw.error.insufficientBalance",
  LightningInvoiceExpired: "withdraw.error.lightningInvoiceExpired",
  WithdrawalQuoteExpired: "withdraw.error.quoteExpired",
} satisfies Record<
  Exclude<
    (ExecuteWithdrawalEarlyError | AbortError)["type"],
    "WithdrawalBelowMinimum"
  >,
  TranslationKey
>

/** Shown while typing, before submit: only what is certain to stay wrong. */
export const destinationErrorKeys = {
  InvalidWithdrawDestination: "withdraw.destination.invalid",
  InvalidLightningInvoice: "withdraw.destination.invalid",
  LightningInvoiceWrongNetwork: "withdraw.error.lightningInvoiceWrongNetwork",
} satisfies Record<ParseWithdrawDestinationError["type"], TranslationKey>

/**
 * What the form holds, kept by the page rather than the form so "Back" from
 * the review returns to it as it was.
 */
export interface WithdrawDraft {
  readonly destination: string
  readonly amount: string
  readonly unit: "sats" | "fiat"
  readonly withdrawAll: boolean
}

export const createWithdrawDraft = (destination: string): WithdrawDraft => ({
  destination,
  amount: "",
  unit: "sats",
  withdrawAll: false,
})

/**
 * The typed amount in sats: whole sats as typed, or fiat (comma or dot, at most
 * the currency's fraction digits) at `rate`. `null` when empty, not positive,
 * or fiat without a rate.
 */
export const draftAmountSats = (
  draft: Pick<WithdrawDraft, "amount" | "unit">,
  {
    rate,
    currency,
  }: { readonly rate: number | null; readonly currency: FiatCurrency }
): number | null => {
  const amount = draft.amount.trim()
  if (draft.unit === "sats") {
    const sats = /^\d+$/u.test(amount) ? Number(amount) : 0
    return Number.isSafeInteger(sats) && sats > 0 ? sats : null
  }
  const minorUnits = decimalAmountToMinorUnits({ currency, value: amount })
  return minorUnits === null || rate === null
    ? null
    : fiatMinorUnitsToSats({ amount: minorUnits, exchangeRate: rate, currency })
}
