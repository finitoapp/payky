import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/** The card tab, as web's `CardPaymentTab`: one button that opens the terminal. */
export function CardPaymentTab({
  canPayCard,
  pending,
  errorKey,
  hasAccount,
  unresolvedTransactionId,
  onPayCard,
}: {
  readonly canPayCard: boolean
  readonly pending: boolean
  readonly errorKey: TranslationKey | null
  readonly hasAccount: boolean
  /** Set while the last attempt's outcome is unknown. */
  readonly unresolvedTransactionId: string | null
  readonly onPayCard: () => void
}) {
  const { t } = useTranslation()

  return (
    <YStack gap="3" items="center">
      <Text fontWeight="600" text="center">
        {t("paymentWait.cardPaid.prompt")}
      </Text>
      <AppButton
        label={
          pending
            ? t("paymentWait.cardPaid.pending")
            : t("paymentWait.cardPaid.action")
        }
        pending={pending}
        disabled={!canPayCard}
        onPress={onPayCard}
      />
      {unresolvedTransactionId !== null ? (
        <Text color="red-600" text="center" accessibilityRole="alert">
          {t("paymentWait.cardPaid.unresolved", {
            transactionId: unresolvedTransactionId,
          })}
        </Text>
      ) : errorKey !== null ? (
        <Text color="red-600" text="center" accessibilityRole="alert">
          {t(errorKey)}
        </Text>
      ) : null}
      {hasAccount ? null : (
        <Text color="muted-foreground" text="center">
          {t("paymentWait.cardPaid.unavailable")}
        </Text>
      )}
    </YStack>
  )
}
