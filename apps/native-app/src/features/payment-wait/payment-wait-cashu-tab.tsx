import { cashuTokenArrivals } from "@payky/core/cashu/cashu-token-listener"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import RefreshCw from "lucide-react-native/icons/refresh-cw"
import { useSyncExternalStore } from "react"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { fontSize } from "../../theme/tokens.ts"
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
      <Text
        maxW={288}
        fontSize={fontSize.sm}
        color="muted-foreground"
        text="center"
        accessibilityRole="alert"
      >
        {t(key, params)}
      </Text>
    )
  }

  if (quoteExpired)
    return (
      <YStack gap={12} items="center">
        <Text
          maxW={288}
          fontSize={fontSize.sm}
          color="muted-foreground"
          text="center"
        >
          {t("paymentWait.cashu.quoteExpired")}
        </Text>
        <Button
          iconStart={RefreshCw}
          label={t("paymentWait.cashu.newQuote")}
          variant="outline"
          pending={newQuotePending}
          onPress={onNewQuote}
        />
      </YStack>
    )

  return qrPayload === null ? (
    <XStack items="center" gap={8}>
      <ActivityIndicator />
      <Text fontSize={fontSize.sm} color="muted-foreground">
        {t("paymentWait.preparing.cashu")}
      </Text>
    </XStack>
  ) : (
    <CopyableQrCode value={qrPayload} />
  )
}
