import { cashuTokenArrivals } from "@payky/core/cashu/cashu-token-listener"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useSyncExternalStore } from "react"
import { ActivityIndicator } from "react-native"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { QrCode } from "../../components/qr-code.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { cashuArrivalMessage } from "./cashu-arrival.ts"

/**
 * The Cashu tab (cashu.md §4): one BIP-321 QR a Lightning wallet pays as an
 * invoice, or a Cashu wallet pays with a token over nostr. A quote the mint
 * let expire offers a new one; the payment's own status still comes from the
 * booked claims, never from what this tab shows of an arriving token.
 */
export function CashuPaymentTab({
  paymentId,
  qrPayload,
  quoteExpired,
  newQuotePending,
  onNewQuote,
}: {
  readonly paymentId: PaymentId
  readonly qrPayload: string | null
  readonly quoteExpired: boolean
  readonly newQuotePending: boolean
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()
  const arrival = useSyncExternalStore(cashuTokenArrivals.subscribe, () =>
    cashuTokenArrivals.get(paymentId)
  )

  if (arrival !== null) {
    const { key, params } = cashuArrivalMessage(arrival)
    return (
      <Text color="muted-foreground" text="center" accessibilityRole="alert">
        {t(key, params)}
      </Text>
    )
  }

  if (quoteExpired)
    return (
      <YStack gap="3" items="center">
        <Text color="muted-foreground" text="center">
          {t("paymentWait.cashu.quoteExpired")}
        </Text>
        <AppButton
          label={t("paymentWait.cashu.newQuote")}
          variant="secondary"
          pending={newQuotePending}
          onPress={onNewQuote}
        />
      </YStack>
    )

  return qrPayload === null ? (
    <YStack items="center" gap="2">
      <ActivityIndicator />
      <Text color="muted-foreground">{t("paymentWait.preparing.cashu")}</Text>
    </YStack>
  ) : (
    <QrCode value={qrPayload} />
  )
}
