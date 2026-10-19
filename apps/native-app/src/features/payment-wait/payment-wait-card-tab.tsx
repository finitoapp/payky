import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import CreditCard from "lucide-react-native/icons/credit-card"
import { Text, YStack } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { fontSize, fontWeight } from "../../theme/tokens.ts"

/**
 * The card tab, as web's `CardPaymentTab`: one 56-high button with a card
 * icon that opens the terminal; the page says what to do above the cancel.
 */
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
    <YStack w="100%" gap={12} items="center" py={16}>
      <Button
        size="lg"
        h={56}
        px={32}
        iconStart={CreditCard}
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
        <Text
          maxW={288}
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          color="destructive"
          text="center"
          accessibilityRole="alert"
        >
          {t("paymentWait.cardPaid.unresolved", {
            transactionId: unresolvedTransactionId,
          })}
        </Text>
      ) : errorKey !== null ? (
        <Text
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          color="destructive"
          text="center"
          accessibilityRole="alert"
        >
          {t(errorKey)}
        </Text>
      ) : null}
      {hasAccount ? null : (
        <Text
          maxW={288}
          fontSize={fontSize.sm}
          color="muted-foreground"
          text="center"
        >
          {t("paymentWait.cardPaid.unavailable")}
        </Text>
      )}
    </YStack>
  )
}
