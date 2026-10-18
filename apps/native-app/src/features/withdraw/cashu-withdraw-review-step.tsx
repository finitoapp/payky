import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import type { CashuWithdrawalQuote } from "@payky/core/modules/withdraw/withdraw-cashu-actions"
import { Text } from "tamagui"
import { useTranslation } from "../../hooks/use-translation.ts"
import {
  Card,
  Collapsible,
  LightningAddress,
  Mono,
  Row,
  SatsWithFiat,
} from "./withdraw-parts.tsx"
import {
  EXPIRY_WARNING_MS,
  ExpiryRow,
  ReviewFooter,
  useMsLeft,
} from "./withdraw-review-step.tsx"

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
  uncertain,
  onBack,
  onConfirm,
  onNewQuote,
  onOpenHistory,
}: {
  readonly quote: CashuWithdrawalQuote
  /** The merchant's own note, saved with the withdrawal. */
  readonly comment: string | null
  readonly confirming: boolean
  readonly requoting: boolean
  readonly confirmError: string | null
  /** A melt may or may not have been sent: nothing may be confirmed again from here. */
  readonly uncertain: boolean
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly onNewQuote: () => void
  readonly onOpenHistory: () => void
}) {
  const { t } = useTranslation()
  const msLeft = useMsLeft(quote.expiresAt)
  const expired = msLeft <= 0
  const error =
    confirmError ??
    (expired ? t("withdraw.error.lightningInvoiceExpired") : null)

  return (
    <Card>
      <Text fontSize={17} fontWeight="600">
        {t("withdraw.review.title")}
      </Text>
      <Row label={t("withdraw.detail.mint")}>{formatMintLabel(quote.mint)}</Row>
      <Row label={t("withdraw.review.destination")} stacked>
        {quote.lightningAddress !== null ? (
          <LightningAddress address={quote.lightningAddress} />
        ) : (
          <Text>{t("withdraw.destination.kind.lightningInvoice")}</Text>
        )}
      </Row>
      {quote.recipientText === null ? null : (
        <Row label={t("withdraw.review.recipientText")} stacked>
          <Text>{quote.recipientText}</Text>
        </Row>
      )}
      <Row label={t("withdraw.review.amount")}>
        <SatsWithFiat sats={quote.amountSats} />
      </Row>
      <Row label={t("withdraw.cashu.review.feeReserve")}>
        <SatsWithFiat sats={quote.cost.feeReserve} />
      </Row>
      {quote.cost.inputFee > 0 ? (
        <Row label={t("withdraw.cashu.review.inputFee")}>
          <SatsWithFiat sats={quote.cost.inputFee} />
        </Row>
      ) : null}
      <Row label={t("withdraw.review.maxTotal")} emphasize>
        <SatsWithFiat sats={quote.cost.maxTotal} />
      </Row>
      <ExpiryRow msLeft={msLeft} />
      <Text color="muted-foreground">
        {t("withdraw.cashu.review.remainder")}
      </Text>
      <Collapsible label={t("withdraw.review.showInvoice")}>
        <Mono value={quote.invoice} />
      </Collapsible>
      {quote.recipientComment === null ? null : (
        <Row label={t("withdraw.review.recipientComment")} stacked>
          <Text>{quote.recipientComment}</Text>
        </Row>
      )}
      {comment === null ? null : (
        <Row label={t("withdraw.review.comment")} stacked>
          <Text>{comment}</Text>
        </Row>
      )}
      <ReviewFooter
        error={error}
        nearlyExpired={msLeft <= EXPIRY_WARNING_MS}
        expired={expired}
        confirming={confirming}
        requoting={requoting}
        uncertain={uncertain}
        onBack={onBack}
        onConfirm={onConfirm}
        onNewQuote={onNewQuote}
        onOpenHistory={onOpenHistory}
      />
    </Card>
  )
}
