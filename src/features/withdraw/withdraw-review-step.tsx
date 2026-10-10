import { useCountdown } from "@dedalik/use-react"
import { ArrowLeftIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { DetailRow } from "@/components/detail-row.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { FieldError, FieldGroup } from "@/components/ui/field.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type {
  LightningWithdrawalQuote,
  OnchainWithdrawalQuote,
  WithdrawalQuote,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import {
  computeTotalDebitedSats,
  WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS,
  withdrawalRecipientSats,
} from "@/core/modules/withdraw/withdraw-utils.ts"
import type { SparkExitSpeed } from "@/core/spark/spark-wallet.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import {
  formatAddressGroups,
  formatCountdown,
  formatSatsAmount,
} from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import { WithdrawCollapsible } from "./withdraw-collapsible.tsx"
import { isExitSpeedUnavailable } from "./withdraw-flow.ts"
import { LightningAddress } from "./withdraw-lightning-address.tsx"
import { SatsWithFiat } from "./withdraw-sats.tsx"

/**
 * Spark documents no confirmation times per exit speed, so each option says
 * what it trades off rather than promising a duration.
 */
const exitSpeedOptions: ReadonlyArray<{
  readonly value: SparkExitSpeed
  readonly label: TranslationKey
  readonly hint: TranslationKey
}> = [
  {
    value: "fast",
    label: "withdraw.review.speed.fast",
    hint: "withdraw.review.speed.fast.hint",
  },
  {
    value: "medium",
    label: "withdraw.review.speed.medium",
    hint: "withdraw.review.speed.medium.hint",
  },
  {
    value: "slow",
    label: "withdraw.review.speed.slow",
    hint: "withdraw.review.speed.slow.hint",
  },
]

/** Under this much time left the countdown turns into a warning. */
const EXPIRY_WARNING_MS = 60_000

function OnchainReview({
  quote,
  exitSpeed,
  onExitSpeedChange,
  locale,
}: {
  readonly quote: OnchainWithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
  readonly locale: string
}) {
  const { t } = useTranslation()
  const fiat = useBtcFiat()
  const feeSats = quote.feeQuote[exitSpeed].totalFeeSats
  const amountSats = withdrawalRecipientSats(quote, exitSpeed)
  const totalSats = computeTotalDebitedSats({
    amountSats: quote.amountSats,
    withdrawAll: quote.withdrawAll,
    availableSats: quote.availableSats,
    feeSats,
  })

  return (
    <>
      <ToggleGroup<SparkExitSpeed>
        value={[exitSpeed]}
        onValueChange={(value) => {
          const [nextExitSpeed] = value
          if (nextExitSpeed) onExitSpeedChange(nextExitSpeed)
        }}
        variant="outline"
        spacing={0}
        className="grid w-full grid-cols-1"
        orientation="vertical"
      >
        {exitSpeedOptions.map((option) => {
          const optionFee = quote.feeQuote[option.value].totalFeeSats
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              disabled={isExitSpeedUnavailable(quote, option.value)}
              className="h-auto w-full justify-between px-4 py-2"
            >
              <span className="flex flex-col items-start">
                <span>{t(option.label)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t(option.hint)}
                </span>
              </span>
              <span className="flex flex-col items-end text-xs text-muted-foreground">
                <span>
                  {t("withdraw.sats", {
                    amount: formatSatsAmount(optionFee, locale),
                  })}
                </span>
                {fiat.approx(optionFee)}
              </span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      <div className="flex flex-col gap-3">
        <DetailRow label={t("withdraw.review.destination")} stacked>
          <span className="break-all font-mono text-xs">
            {formatAddressGroups(quote.onchainAddress)}
          </span>
        </DetailRow>
        <DetailRow label={t("withdraw.review.amount")}>
          <SatsWithFiat sats={amountSats} locale={locale} />
        </DetailRow>
        <DetailRow label={t("withdraw.review.fee")}>
          <SatsWithFiat sats={feeSats} locale={locale} />
        </DetailRow>
        <DetailRow label={t("withdraw.review.total")} emphasize>
          <SatsWithFiat sats={totalSats} locale={locale} />
        </DetailRow>
      </div>
    </>
  )
}

function LightningReview({
  quote,
  msLeft,
  locale,
}: {
  readonly quote: LightningWithdrawalQuote
  readonly msLeft: number
  readonly locale: string
}) {
  const { t } = useTranslation()
  const maxFee = formatSatsAmount(quote.maxFeeSats, locale)
  const invoiceDescription =
    quote.lightningAddress === null ? quote.invoice.description : null

  return (
    <div className="flex flex-col gap-3">
      <DetailRow label={t("withdraw.review.destination")} stacked>
        {quote.lightningAddress !== null ? (
          <LightningAddress address={quote.lightningAddress} />
        ) : (
          t("withdraw.destination.kind.lightningInvoice")
        )}
      </DetailRow>
      {quote.recipientText !== null ? (
        <DetailRow
          label={t(
            invoiceDescription === null
              ? "withdraw.review.recipientText"
              : "withdraw.review.invoiceDescription"
          )}
          stacked
        >
          <span className="break-words">{quote.recipientText}</span>
        </DetailRow>
      ) : null}
      <DetailRow label={t("withdraw.review.amount")}>
        <SatsWithFiat sats={quote.amountSats} locale={locale} />
      </DetailRow>
      <DetailRow label={t("withdraw.review.maxFee")}>
        {quote.invoice.sparkFallbackIdentity !== null ? (
          t("withdraw.review.maxFeeSpark", { amount: maxFee })
        ) : (
          <SatsWithFiat sats={quote.maxFeeSats} locale={locale} />
        )}
      </DetailRow>
      <DetailRow label={t("withdraw.review.maxTotal")} emphasize>
        <SatsWithFiat
          sats={quote.amountSats + quote.maxFeeSats}
          locale={locale}
        />
      </DetailRow>
      <DetailRow label={t("withdraw.review.expiresIn")}>
        <span
          className={cn(
            "tabular-nums",
            msLeft <= EXPIRY_WARNING_MS && "text-destructive"
          )}
        >
          {formatCountdown(msLeft)}
        </span>
      </DetailRow>
      <p className="text-sm text-muted-foreground">
        {t("withdraw.review.remainder", { amount: maxFee })}
      </p>
      <WithdrawCollapsible label={t("withdraw.review.showInvoice")}>
        <span className="break-all font-mono text-xs">
          {quote.invoice.invoice}
        </span>
      </WithdrawCollapsible>
    </div>
  )
}

export function WithdrawReviewStep({
  quote,
  exitSpeed,
  confirming,
  requoting,
  confirmError,
  onExitSpeedChange,
  onBack,
  onConfirm,
  onNewQuote,
  locale,
}: {
  readonly quote: WithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  readonly confirming: boolean
  readonly requoting: boolean
  readonly confirmError: string | null
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly onNewQuote: () => void
  readonly locale: string
}) {
  const { t } = useTranslation()
  // The moment confirming is refused, not the invoice's own expiry.
  const expiresAt =
    (quote.kind === "lightning"
      ? quote.invoice.expiresAt
      : Date.parse(quote.feeQuote.expiresAt)) -
    WITHDRAWAL_QUOTE_EXPIRY_MARGIN_MS
  const { remainingMs: msLeft, isFinished: expired } = useCountdown(expiresAt)
  const nearlyExpired = msLeft <= EXPIRY_WARNING_MS
  const error =
    confirmError ??
    (expired
      ? t(
          quote.kind === "lightning"
            ? "withdraw.error.lightningInvoiceExpired"
            : "withdraw.error.quoteExpired"
        )
      : null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("withdraw.review.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {quote.kind === "onchain" ? (
            <OnchainReview
              quote={quote}
              exitSpeed={exitSpeed}
              onExitSpeedChange={onExitSpeedChange}
              locale={locale}
            />
          ) : (
            <LightningReview quote={quote} msLeft={msLeft} locale={locale} />
          )}

          <p className="text-sm text-muted-foreground">
            {t("withdraw.review.warning")}
          </p>

          <FieldError>{error}</FieldError>
          {error !== null || nearlyExpired ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={onNewQuote}
              disabled={confirming || requoting}
            >
              {requoting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              {t("withdraw.review.newQuote")}
            </Button>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={confirming}
        >
          <ArrowLeftIcon />
          {t("withdraw.review.back")}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={onConfirm}
          disabled={confirming || requoting || expired}
        >
          {confirming ? <LoaderCircleIcon className="animate-spin" /> : null}
          {confirming
            ? t("withdraw.review.confirming")
            : t("withdraw.review.confirm")}
        </Button>
      </CardFooter>
    </Card>
  )
}
