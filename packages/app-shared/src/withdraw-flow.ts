import { type AbortError, err, ok, type Result } from "@evolu/common"
import {
  decimalAmountToMinorUnits,
  fiatMinorUnitsToSats,
} from "@payky/core/modules/shared/money"
import {
  type FiatCurrency,
  type NonEmptyString255,
  NonEmptyString255Schema,
  type PositiveInteger,
  PositiveIntegerSchema,
} from "@payky/core/modules/shared/schema"
import type {
  ExecuteWithdrawalEarlyError,
  ExecuteWithdrawalError,
  InsufficientWithdrawalBalanceError,
  QuoteWithdrawalError,
  SupportedWithdrawDestination,
  WithdrawalAmountOutOfRangeError,
  WithdrawalQuote,
} from "@payky/core/modules/withdraw/withdraw-actions"
import {
  type ParseWithdrawDestinationError,
  parseWithdrawDestination,
  type WithdrawDestination,
} from "@payky/core/modules/withdraw/withdraw-destination-utils"
import type { WithdrawalId } from "@payky/core/modules/withdraw/withdraw-types"
import {
  isOnchainWithdrawAllBelowMinimum,
  WITHDRAWAL_CHECK_WINDOW_MS,
  WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS,
  WITHDRAWAL_SEND_TIMEOUT_MS,
  WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS,
  withdrawalRecipientSats,
} from "@payky/core/modules/withdraw/withdraw-utils"
import type { SparkExitSpeed } from "@payky/core/spark/spark-wallet"
import { formatSatsAmount } from "./format-money.ts"
import type { TranslationKey } from "./i18n/resources.ts"
import type { createTranslate } from "./i18n/translate.ts"

export type Translate = ReturnType<typeof createTranslate>

/** The wallet a withdrawal leaves: Spark's, or one mint of the shared Cashu wallet. */
export type WithdrawMethod = "spark" | "cashu"

/** What the merchant asked for, kept so the review can fetch a new estimate. */
export interface WithdrawRequest {
  readonly destination: SupportedWithdrawDestination
  /** `undefined` means "withdraw all", or an invoice that sets its own amount. */
  readonly amountSats: PositiveInteger | undefined
  /** LUD-12, for a Lightning address that accepts it; ignored elsewhere. */
  readonly recipientComment: string
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

/** The quote errors that carry amounts, worded alike for Spark and Cashu. */
export const amountErrorMessage = (
  error: InsufficientWithdrawalBalanceError | WithdrawalAmountOutOfRangeError,
  t: Translate
): string => {
  switch (error.type) {
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
  }
}

export const quoteErrorMessage = (
  error: QuoteWithdrawalError | AbortError,
  t: Translate
): string => {
  switch (error.type) {
    case "WithdrawalBelowMinimum":
      return t("withdraw.error.belowMinimum", { amount: error.minSats })
    case "InsufficientWithdrawalBalance":
    case "WithdrawalAmountOutOfRange":
      return amountErrorMessage(error, t)
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
  readonly recipientComment: string
  /** The merchant's own note, saved with the withdrawal. */
  readonly comment: string
}

export const createWithdrawDraft = (destination: string): WithdrawDraft => ({
  destination,
  amount: "",
  unit: "sats",
  withdrawAll: false,
  recipientComment: "",
  comment: "",
})

/** The draft's own note as the withdrawal stores it: `null` when blank. */
export const draftComment = (
  draft: Pick<WithdrawDraft, "comment">
): NonEmptyString255 | null => {
  const comment = NonEmptyString255Schema.safeParse(draft.comment)
  return comment.success ? comment.data : null
}

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

/** Why "Withdraw all" is off for this destination, or `null` when it is offered. */
export const withdrawAllUnavailableKey = (
  destination: WithdrawDestination | null
): TranslationKey | null =>
  destination?.kind === "lightning-invoice" && destination.amountSats !== null
    ? "withdraw.all.unavailableInvoice"
    : null

/**
 * The draft after the destination text changed. An on-chain URI that carries
 * an amount (BIP-21) fills the amount in and turns "withdraw all" off.
 */
export const draftWithDestination = (
  draft: WithdrawDraft,
  destination: string
): WithdrawDraft => {
  const next = parseWithdrawDestination(destination)
  if (next.ok && next.value.kind === "onchain" && next.value.amountSats) {
    return {
      ...draft,
      destination,
      withdrawAll: false,
      unit: "sats",
      amount: String(next.value.amountSats),
    }
  }
  return { ...draft, destination }
}

/**
 * What the form submits for a quote: the payable destination and the amount
 * the merchant must have typed. An invoice with its own amount, and "withdraw
 * all", send none. The error is the translation key to show on the form.
 */
export const buildWithdrawRequest = ({
  destination,
  destinationError,
  draft,
  typedSats,
  withdrawAll,
}: {
  readonly destination: WithdrawDestination | null
  readonly destinationError: TranslationKey | null
  readonly draft: Pick<WithdrawDraft, "recipientComment">
  readonly typedSats: number | null
  /** Already `false` where the destination does not offer it. */
  readonly withdrawAll: boolean
}): Result<WithdrawRequest, TranslationKey> => {
  if (destination === null || destination.kind === "unsupported") {
    return err(destinationError ?? "withdraw.destination.invalid")
  }
  let amountSats: PositiveInteger | undefined
  const invoiceHasAmount =
    destination.kind === "lightning-invoice" && destination.amountSats !== null
  if (!invoiceHasAmount && !withdrawAll) {
    const amount = PositiveIntegerSchema.safeParse(typedSats)
    if (!amount.success) return err("withdraw.amount.invalid")
    amountSats = amount.data
  }
  return ok({
    destination,
    amountSats,
    recipientComment: draft.recipientComment,
  })
}

/**
 * What the PIN prompt names (access/0007): the amount the recipient gets and
 * where it goes, so the owner approves that withdrawal and not just "a
 * withdrawal".
 */
export const withdrawPinDetail = ({
  quote,
  exitSpeed,
  t,
  locale,
}: {
  readonly quote: WithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  readonly t: Translate
  readonly locale: string
}): string =>
  t("withdraw.review.pinDetail", {
    amount: formatSatsAmount(withdrawalRecipientSats(quote, exitSpeed), locale),
    destination:
      quote.kind === "onchain"
        ? quote.onchainAddress
        : (quote.lightningAddress ??
          t("withdraw.destination.kind.lightningInvoice")),
  })

/**
 * How a send ended, for the screen that started it. `recorded` means the
 * withdrawal row exists and its detail follows what happens next, whether the
 * money left, was rejected, or is not known yet; `failed` came back before
 * anything was recorded, so the review stays open with `message`.
 */
export type ConfirmOutcome =
  | {
      readonly kind: "recorded"
      readonly withdrawalId: WithdrawalId
      readonly result: "sent" | "rejected" | "unknown"
    }
  | { readonly kind: "failed"; readonly message: string }

export const confirmOutcome = (
  result: Result<
    { readonly withdrawalId: WithdrawalId },
    ExecuteWithdrawalError
  >,
  t: Translate
): ConfirmOutcome => {
  if (result.ok) {
    return {
      kind: "recorded",
      withdrawalId: result.value.withdrawalId,
      result: "sent",
    }
  }
  const { error } = result
  if (error.type === "WithdrawalRejected") {
    return {
      kind: "recorded",
      withdrawalId: error.withdrawalId,
      result: "rejected",
    }
  }
  if (error.type === "WithdrawalOutcomeUnknown") {
    return {
      kind: "recorded",
      withdrawalId: error.withdrawalId,
      result: "unknown",
    }
  }
  return {
    kind: "failed",
    message:
      error.type === "WithdrawalBelowMinimum"
        ? t("withdraw.error.belowMinimum", { amount: error.minSats })
        : t(earlyConfirmErrorKeys[error.type]),
  }
}

/** The form's range and minimum hints, true where the typed amount breaks them. */
export const amountFieldWarnings = ({
  typedSats,
  range,
  withdrawAll,
  onchainMinimumSats,
}: {
  readonly typedSats: number | null
  readonly range: {
    readonly minSendableSats: number
    readonly maxSendableSats: number
  } | null
  readonly withdrawAll: boolean
  readonly onchainMinimumSats: number | null
}): {
  readonly outOfRange: boolean
  readonly belowOnchainMinimum: boolean
} => ({
  outOfRange:
    range !== null &&
    !withdrawAll &&
    typedSats !== null &&
    (typedSats < range.minSendableSats || typedSats > range.maxSendableSats),
  belowOnchainMinimum:
    onchainMinimumSats !== null &&
    !withdrawAll &&
    typedSats !== null &&
    typedSats < onchainMinimumSats,
})

/**
 * When a pending Lightning withdrawal's text changes: the creating device
 * promises ten minutes, any other one a day; past the check window nobody
 * is watching any more (withdraw/0003, withdraw/0007).
 */
export const pendingLightningTimes = ({
  createdAt,
  ownDevice,
}: {
  readonly createdAt: number
  readonly ownDevice: boolean
}): { readonly timeoutAt: number; readonly windowEndsAt: number } => ({
  timeoutAt:
    createdAt +
    (ownDevice
      ? WITHDRAWAL_SEND_TIMEOUT_MS
      : WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS),
  windowEndsAt: createdAt + WITHDRAWAL_CHECK_WINDOW_MS,
})

export const pendingLightningText = ({
  times,
  now,
  ownDevice,
  deviceName,
  t,
}: {
  readonly times: ReturnType<typeof pendingLightningTimes>
  readonly now: number
  readonly ownDevice: boolean
  readonly deviceName: string | null
  readonly t: Translate
}): string => {
  if (now >= times.windowEndsAt) return t("withdraw.detail.pending.unknown")
  if (now >= times.timeoutAt) return t("withdraw.detail.pending.processing")
  if (ownDevice) return t("withdraw.detail.pending.ownDevice")
  return deviceName === null
    ? t("withdraw.detail.pending.unknownDevice")
    : t("withdraw.detail.pending.otherDevice", { device: deviceName })
}

/**
 * The moment confirming is refused, not the invoice's own expiry: the
 * invoice's, or the on-chain fee quote's, less the margin the send needs.
 */
export const quoteConfirmDeadline = (quote: WithdrawalQuote): number =>
  (quote.kind === "lightning"
    ? quote.invoice.expiresAt
    : Date.parse(quote.feeQuote.expiresAt)) - WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS
