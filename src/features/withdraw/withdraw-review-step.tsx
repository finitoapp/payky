import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react"

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
import type { WithdrawalQuote } from "@/core/modules/withdrawal/withdrawal-actions.ts"
import { computeTotalDebitedSats } from "@/core/modules/withdrawal/withdrawal-utils.ts"
import type { SparkExitSpeed } from "@/core/spark/spark-wallet.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatAddressGroups, formatSatsAmount } from "./withdraw-utils.ts"

const exitSpeedOptions: ReadonlyArray<{
  readonly value: SparkExitSpeed
  readonly label: TranslationKey
}> = [
  { value: "fast", label: "withdraw.review.speed.fast" },
  { value: "medium", label: "withdraw.review.speed.medium" },
  { value: "slow", label: "withdraw.review.speed.slow" },
]

export function WithdrawReviewStep({
  address,
  quote,
  exitSpeed,
  confirming,
  confirmError,
  onExitSpeedChange,
  onBack,
  onConfirm,
  locale,
}: {
  readonly address: string
  readonly quote: WithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  readonly confirming: boolean
  readonly confirmError: TranslationKey | null
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly locale: string
}) {
  const { t } = useTranslation()
  const feeEstimate = quote.feeQuote[exitSpeed]
  const totalSats = computeTotalDebitedSats({
    amountSats: quote.amountSats,
    withdrawAll: quote.withdrawAll,
    availableSats: quote.availableSats,
    feeSats: feeEstimate.totalFeeSats,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("withdraw.review.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
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
            {exitSpeedOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="w-full justify-between px-4"
              >
                <span>{t(option.label)}</span>
                <span className="text-xs text-muted-foreground">
                  {t("withdraw.sats", {
                    amount: formatSatsAmount(
                      quote.feeQuote[option.value].totalFeeSats,
                      locale
                    ),
                  })}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <dl className="flex flex-col gap-3 text-sm">
            <WithdrawReviewRow label={t("withdraw.review.destination")} stacked>
              <span className="break-all font-mono text-xs">
                {formatAddressGroups(address)}
              </span>
            </WithdrawReviewRow>
            <WithdrawReviewRow label={t("withdraw.review.amount")}>
              {t("withdraw.sats", {
                amount: formatSatsAmount(quote.amountSats, locale),
              })}
            </WithdrawReviewRow>
            <WithdrawReviewRow label={t("withdraw.review.fee")}>
              {t("withdraw.sats", {
                amount: formatSatsAmount(feeEstimate.totalFeeSats, locale),
              })}
            </WithdrawReviewRow>
            <WithdrawReviewRow label={t("withdraw.review.total")} emphasize>
              {t("withdraw.sats", {
                amount: formatSatsAmount(totalSats, locale),
              })}
            </WithdrawReviewRow>
          </dl>

          <p className="text-sm text-muted-foreground">
            {t("withdraw.review.warning")}
          </p>

          <FieldError>{confirmError ? t(confirmError) : null}</FieldError>
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
          disabled={confirming}
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

function WithdrawReviewRow({
  label,
  emphasize,
  stacked,
  children,
}: {
  readonly label: string
  readonly emphasize?: boolean
  readonly stacked?: boolean
  readonly children: React.ReactNode
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1"
          : "flex items-center justify-between gap-4"
      }
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasize ? "font-semibold" : undefined}>{children}</dd>
    </div>
  )
}
