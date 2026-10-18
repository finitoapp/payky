import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import type { CashuWithdrawalQuote } from "@payky/core/modules/withdraw/withdraw-cashu-actions"
import { DetailRow } from "@/components/detail-row.tsx"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { WithdrawCollapsible } from "./withdraw-collapsible.tsx"
import { LightningAddress } from "./withdraw-lightning-address.tsx"
import {
  ExpiryRow,
  useQuoteCountdown,
  WithdrawReviewCard,
} from "./withdraw-review-step.tsx"
import { SatsWithFiat } from "./withdraw-sats.tsx"

/**
 * A Cashu melt before it is confirmed: what goes out, the mint's fee reserve
 * and input fee, and the most that can leave the mint (withdraw/0011).
 */
export function CashuWithdrawReviewStep({
  quote,
  comment,
  confirming,
  requoting,
  confirmError,
  onBack,
  onConfirm,
  onNewQuote,
}: {
  readonly quote: CashuWithdrawalQuote
  /** The merchant's own note, saved with the withdrawal. */
  readonly comment: string | null
  readonly confirming: boolean
  readonly requoting: boolean
  readonly confirmError: string | null
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { msLeft, expired, nearlyExpired } = useQuoteCountdown(quote.expiresAt)
  const error =
    confirmError ??
    (expired ? t("withdraw.error.lightningInvoiceExpired") : null)

  return (
    <WithdrawReviewCard
      recipientComment={quote.recipientComment}
      comment={comment}
      error={error}
      nearlyExpired={nearlyExpired}
      expired={expired}
      confirming={confirming}
      requoting={requoting}
      onBack={onBack}
      onConfirm={onConfirm}
      onNewQuote={onNewQuote}
    >
      <div className="flex flex-col gap-3">
        <DetailRow
          label={t("withdraw.detail.mint")}
          value={formatMintLabel(quote.mint)}
        />
        <DetailRow label={t("withdraw.review.destination")} stacked>
          {quote.lightningAddress !== null ? (
            <LightningAddress address={quote.lightningAddress} />
          ) : (
            t("withdraw.destination.kind.lightningInvoice")
          )}
        </DetailRow>
        {quote.recipientText !== null ? (
          <DetailRow label={t("withdraw.review.recipientText")} stacked>
            <span className="break-words">{quote.recipientText}</span>
          </DetailRow>
        ) : null}
        <DetailRow label={t("withdraw.review.amount")}>
          <SatsWithFiat sats={quote.amountSats} locale={locale} />
        </DetailRow>
        <DetailRow label={t("withdraw.cashu.review.feeReserve")}>
          <SatsWithFiat sats={quote.cost.feeReserve} locale={locale} />
        </DetailRow>
        {quote.cost.inputFee > 0 ? (
          <DetailRow label={t("withdraw.cashu.review.inputFee")}>
            <SatsWithFiat sats={quote.cost.inputFee} locale={locale} />
          </DetailRow>
        ) : null}
        <DetailRow label={t("withdraw.review.maxTotal")} emphasize>
          <SatsWithFiat sats={quote.cost.maxTotal} locale={locale} />
        </DetailRow>
        <ExpiryRow msLeft={msLeft} />
        <p className="text-sm text-muted-foreground">
          {t("withdraw.cashu.review.remainder")}
        </p>
        <WithdrawCollapsible label={t("withdraw.review.showInvoice")}>
          <span className="break-all font-mono text-xs">{quote.invoice}</span>
        </WithdrawCollapsible>
      </div>
    </WithdrawReviewCard>
  )
}
