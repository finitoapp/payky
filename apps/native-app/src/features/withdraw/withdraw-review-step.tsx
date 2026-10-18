import { formatSatsAmount } from "@payky/app-shared/format-money"
import {
  formatAddressGroups,
  formatCountdown,
} from "@payky/app-shared/format-text"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  isExitSpeedUnavailable,
  quoteConfirmDeadline,
} from "@payky/app-shared/withdraw-flow"
import type {
  LightningWithdrawalQuote,
  OnchainWithdrawalQuote,
  WithdrawalQuote,
} from "@payky/core/modules/withdraw/withdraw-actions"
import {
  computeTotalDebitedSats,
  withdrawalRecipientSats,
} from "@payky/core/modules/withdraw/withdraw-utils"
import type { SparkExitSpeed } from "@payky/core/spark/spark-wallet"
import { useEffect, useState } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  Card,
  Collapsible,
  LightningAddress,
  Mono,
  Row,
  SatsWithFiat,
} from "./withdraw-parts.tsx"

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
export const EXPIRY_WARNING_MS = 60_000

function OnchainReview({
  quote,
  exitSpeed,
  confirming,
  onExitSpeedChange,
}: {
  readonly quote: OnchainWithdrawalQuote
  readonly exitSpeed: SparkExitSpeed
  /** The fee shown must not change while a send is being confirmed. */
  readonly confirming: boolean
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const feeSats = quote.feeQuote[exitSpeed].totalFeeSats
  const totalSats = computeTotalDebitedSats({
    amountSats: quote.amountSats,
    withdrawAll: quote.withdrawAll,
    availableSats: quote.availableSats,
    feeSats,
  })

  return (
    <>
      <YStack gap="2">
        {exitSpeedOptions.map((option) => {
          const unavailable = isExitSpeedUnavailable(quote, option.value)
          const selected = option.value === exitSpeed
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: unavailable }}
              disabled={unavailable || confirming}
              onPress={() => onExitSpeedChange(option.value)}
            >
              <XStack
                justify="space-between"
                items="center"
                gap="3"
                p="3"
                rounded="lg"
                borderWidth={selected ? 2 : 1}
                borderColor={selected ? "primary" : "border-color"}
                opacity={unavailable ? 0.5 : 1}
              >
                <YStack flex={1}>
                  <Text fontWeight="600">{t(option.label)}</Text>
                  <Text fontSize={12} color="muted-foreground">
                    {t(option.hint)}
                  </Text>
                </YStack>
                <Text>
                  {t("withdraw.sats", {
                    amount: formatSatsAmount(
                      quote.feeQuote[option.value].totalFeeSats,
                      locale
                    ),
                  })}
                </Text>
              </XStack>
            </Pressable>
          )
        })}
      </YStack>
      <Row label={t("withdraw.review.destination")} stacked>
        <Mono value={formatAddressGroups(quote.onchainAddress)} />
      </Row>
      <Row label={t("withdraw.review.amount")}>
        <SatsWithFiat sats={withdrawalRecipientSats(quote, exitSpeed)} />
      </Row>
      <Row label={t("withdraw.review.fee")}>
        <SatsWithFiat sats={feeSats} />
      </Row>
      <Row label={t("withdraw.review.total")} emphasize>
        <SatsWithFiat sats={totalSats} />
      </Row>
    </>
  )
}

function LightningReview({
  quote,
  msLeft,
}: {
  readonly quote: LightningWithdrawalQuote
  readonly msLeft: number
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const maxFee = formatSatsAmount(quote.maxFeeSats, locale)
  const invoiceDescription =
    quote.lightningAddress === null ? quote.invoice.description : null

  return (
    <>
      <Row label={t("withdraw.review.destination")} stacked>
        {quote.lightningAddress !== null ? (
          <LightningAddress address={quote.lightningAddress} />
        ) : (
          <Text>{t("withdraw.destination.kind.lightningInvoice")}</Text>
        )}
      </Row>
      {quote.recipientText === null ? null : (
        <Row
          label={t(
            invoiceDescription === null
              ? "withdraw.review.recipientText"
              : "withdraw.review.invoiceDescription"
          )}
          stacked
        >
          <Text>{quote.recipientText}</Text>
        </Row>
      )}
      <Row label={t("withdraw.review.amount")}>
        <SatsWithFiat sats={quote.amountSats} />
      </Row>
      <Row label={t("withdraw.review.lightningFee")}>
        {quote.invoice.sparkFallbackIdentity !== null
          ? t("withdraw.review.maxFeeSpark", { amount: maxFee })
          : t("withdraw.review.feeEstimate", {
              estimate: formatSatsAmount(quote.feeEstimateSats, locale),
              max: maxFee,
            })}
      </Row>
      <Row label={t("withdraw.review.maxTotal")} emphasize>
        <SatsWithFiat sats={quote.amountSats + quote.maxFeeSats} />
      </Row>
      <ExpiryRow msLeft={msLeft} />
      <Text color="muted-foreground">{t("withdraw.review.remainder")}</Text>
      <Collapsible label={t("withdraw.review.showInvoice")}>
        <Mono value={quote.invoice.invoice} />
      </Collapsible>
    </>
  )
}

/** How long the quote can still be confirmed, red in its last minute. */
export function ExpiryRow({ msLeft }: { readonly msLeft: number }) {
  const { t } = useTranslation()
  return (
    <Row label={t("withdraw.review.expiresIn")}>
      <Text color={msLeft <= EXPIRY_WARNING_MS ? "red-600" : "color"}>
        {formatCountdown(msLeft)}
      </Text>
    </Row>
  )
}

/** Milliseconds until `deadline`, ticking each second. */
export const useMsLeft = (deadline: number): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, deadline - now)
}

/**
 * The warning, the error and the buttons every review ends with. An
 * uncertain send (withdraw/0007) offers no confirm or new quote, only the
 * history to check the result in.
 */
export function ReviewFooter({
  error,
  nearlyExpired,
  expired,
  confirming,
  requoting,
  uncertain,
  onBack,
  onConfirm,
  onNewQuote,
  onOpenHistory,
}: {
  readonly error: string | null
  readonly nearlyExpired: boolean
  readonly expired: boolean
  readonly confirming: boolean
  readonly requoting: boolean
  /** A send may or may not have happened: nothing may be confirmed again from here. */
  readonly uncertain: boolean
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly onNewQuote: () => void
  readonly onOpenHistory: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Text color="muted-foreground">{t("withdraw.review.warning")}</Text>

      {error === null ? null : (
        <Text color="red-600" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {uncertain ? (
        <AppButton
          label={t("withdraw.history.title")}
          onPress={onOpenHistory}
        />
      ) : (
        <>
          {error !== null || nearlyExpired ? (
            <AppButton
              label={t("withdraw.review.newQuote")}
              variant="secondary"
              disabled={confirming}
              pending={requoting}
              onPress={onNewQuote}
            />
          ) : null}
          <AppButton
            label={
              confirming
                ? t("withdraw.review.confirming")
                : t("withdraw.review.confirm")
            }
            pending={confirming}
            disabled={requoting || expired}
            onPress={onConfirm}
          />
        </>
      )}
      <AppButton
        label={t("withdraw.review.back")}
        variant="secondary"
        disabled={confirming}
        onPress={onBack}
      />
    </>
  )
}

export function WithdrawReviewStep({
  quote,
  recipientComment,
  comment,
  exitSpeed,
  confirming,
  requoting,
  confirmError,
  uncertain,
  onExitSpeedChange,
  onBack,
  onConfirm,
  onNewQuote,
  onOpenHistory,
}: {
  readonly quote: WithdrawalQuote
  /** The LUD-12 comment sent to the recipient. */
  readonly recipientComment: string | null
  /** The merchant's own note, saved with the withdrawal. */
  readonly comment: string | null
  readonly exitSpeed: SparkExitSpeed
  readonly confirming: boolean
  readonly requoting: boolean
  readonly confirmError: string | null
  /** A send may or may not have happened: nothing may be confirmed again from here. */
  readonly uncertain: boolean
  readonly onExitSpeedChange: (exitSpeed: SparkExitSpeed) => void
  readonly onBack: () => void
  readonly onConfirm: () => void
  readonly onNewQuote: () => void
  readonly onOpenHistory: () => void
}) {
  const { t } = useTranslation()
  const msLeft = useMsLeft(quoteConfirmDeadline(quote))
  const expired = msLeft <= 0
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
      <Text fontSize={17} fontWeight="600">
        {t("withdraw.review.title")}
      </Text>
      {quote.kind === "onchain" ? (
        <OnchainReview
          quote={quote}
          exitSpeed={exitSpeed}
          confirming={confirming}
          onExitSpeedChange={onExitSpeedChange}
        />
      ) : (
        <LightningReview quote={quote} msLeft={msLeft} />
      )}

      {quote.kind === "lightning" && recipientComment !== null ? (
        <Row label={t("withdraw.review.recipientComment")} stacked>
          <Text>{recipientComment}</Text>
        </Row>
      ) : null}
      {comment === null ? null : (
        <Row label={t("withdraw.review.comment")} stacked>
          <Text>{comment}</Text>
        </Row>
      )}

      <ReviewFooter
        error={error}
        nearlyExpired={nearlyExpired}
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
