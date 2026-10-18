import type { AbortError, Result } from "@evolu/common"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import type { PositiveInteger } from "@payky/core/modules/shared/schema"
import type {
  CashuWithdrawalQuote,
  ExecuteCashuWithdrawalError,
  QuoteCashuWithdrawalError,
} from "@payky/core/modules/withdraw/withdraw-cashu-actions"
import type { WithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import type { WithdrawalId } from "@payky/core/modules/withdraw/withdraw-types"
import { formatSatsAmount } from "./format-money.ts"
import type { TranslationKey } from "./i18n/resources.ts"
import {
  amountErrorMessage,
  type ConfirmOutcome,
  type Translate,
} from "./withdraw-flow.ts"

/** The mint as the lists name it: without the scheme, its path kept (Linky's `formatMintLabel`). */
export const formatMintLabel = (mint: string): string =>
  mint.replace(/^https?:\/\//u, "")

/** What the merchant asked for, kept so the review can fetch a new quote. */
export interface CashuWithdrawRequest {
  readonly mint: MintUrl
  readonly destination: WithdrawDestination
  /**
   * `undefined` for an invoice, which carries its own amount, or "withdraw
   * all" to a Lightning address (withdraw/0014).
   */
  readonly amountSats: PositiveInteger | undefined
  /** LUD-12, for a Lightning address that accepts it; ignored elsewhere. */
  readonly recipientComment: string
}

const lightningAddressUnavailable = "withdraw.error.lightningAddressUnavailable"

const cashuQuoteErrorKeys = {
  AbortError: "withdraw.quoteError.generic",
  MintUnreachable: "withdraw.cashu.error.unreachable",
  MintRejected: "withdraw.cashu.error.rejected",
  CashuWithdrawalAmountNeeded: "withdraw.amount.invalid",
  CashuWithdrawalToSelf: "withdraw.cashu.error.toSelf",
  CashuWithdrawalInvoiceExpired: "withdraw.error.lightningInvoiceExpired",
  CashuWithdrawalDestinationUnsupported: "withdraw.cashu.error.destination",
  LightningAddressInvoiceMismatch: "withdraw.error.lightningAddressMismatch",
  FetchError: lightningAddressUnavailable,
  LnurlRequestError: lightningAddressUnavailable,
  LnurlHttpError: lightningAddressUnavailable,
  LnurlResponseError: lightningAddressUnavailable,
} satisfies Record<
  Exclude<
    (QuoteCashuWithdrawalError | AbortError)["type"],
    "InsufficientWithdrawalBalance" | "WithdrawalAmountOutOfRange"
  >,
  TranslationKey
>

export const cashuQuoteErrorMessage = (
  error: QuoteCashuWithdrawalError | AbortError,
  t: Translate
): string =>
  error.type === "InsufficientWithdrawalBalance" ||
  error.type === "WithdrawalAmountOutOfRange"
    ? amountErrorMessage(error, t)
    : t(cashuQuoteErrorKeys[error.type])

/** Refused before the melt was sent: the review stays open and says why. */
const cashuEarlyConfirmErrorKeys = {
  AbortError: "withdraw.review.error.interrupted",
  MintUnreachable: "withdraw.cashu.error.unreachable",
  MintRejected: "withdraw.cashu.error.rejected",
  CounterLockTimeout: "withdraw.cashu.error.unreachable",
  QuoteExpired: "withdraw.error.quoteExpired",
  CashuInsufficientFunds: "withdraw.cashu.error.insufficient",
  CashuMeltQuoteNotPayable: "withdraw.cashu.error.rejected",
  CashuMeltUnpaid: "withdraw.cashu.error.rejected",
  CashuMeltPending: "withdraw.detail.pending.cashu",
  CashuWithdrawalDestinationUnsupported: "withdraw.cashu.error.destination",
} satisfies Record<
  Exclude<
    (ExecuteCashuWithdrawalError | AbortError)["type"],
    "WithdrawalRejected" | "WithdrawalOutcomeUnknown"
  >,
  TranslationKey
>

/**
 * How a melt ended for the screen that started it, as `confirmOutcome` does
 * for Spark: `recorded` once the withdrawal's melt was sent (its detail
 * follows the mint), `failed` when it was refused before that.
 */
export const cashuConfirmOutcome = (
  result: Result<
    { readonly withdrawalId: WithdrawalId },
    ExecuteCashuWithdrawalError | AbortError
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
    message: t(cashuEarlyConfirmErrorKeys[error.type]),
  }
}

/** What the PIN prompt names (access/0007): the amount and where it goes. */
export const cashuWithdrawPinDetail = ({
  quote,
  t,
  locale,
}: {
  readonly quote: CashuWithdrawalQuote
  readonly t: Translate
  readonly locale: string
}): string =>
  t("withdraw.review.pinDetail", {
    amount: formatSatsAmount(quote.amountSats, locale),
    destination:
      quote.lightningAddress ?? t("withdraw.destination.kind.lightningInvoice"),
  })

/** The mints holding ecash, by name. */
export const fundedMints = (
  balances: ReadonlyMap<MintUrl, number>
): ReadonlyArray<readonly [MintUrl, number]> =>
  [...balances]
    .filter(([, balance]) => balance > 0)
    .toSorted(([a], [b]) => a.localeCompare(b))

/** The chosen mint, else the default one if funded, else the first funded. */
export const withdrawMint = ({
  funded,
  chosen,
  defaultMint,
}: {
  readonly funded: ReadonlyArray<readonly [MintUrl, number]>
  readonly chosen: MintUrl | null
  readonly defaultMint: MintUrl | null
}): MintUrl | null =>
  chosen ??
  (funded.some(([candidate]) => candidate === defaultMint)
    ? defaultMint
    : (funded[0]?.[0] ?? null))
