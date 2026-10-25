import { syncLightningAddressPayment } from "@payky/core/modules/payment/payment-lightning-address-actions"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { fontSize } from "../../theme/tokens.ts"
import { BoltCardReader } from "./payment-wait-bolt-card.tsx"

const VERIFY_POLL_INTERVAL_MS = 2_000

/**
 * The invoice the merchant's own wallet issued, as web's
 * `LightningAddressPaymentTab`: it polls the LUD-21 verify URL every two
 * seconds while the payment waits, and the background job keeps polling once
 * the screen is closed (lightning-address/0005).
 */
export function LightningAddressPaymentTab({
  paymentId,
  invoice,
  payable,
  expired,
}: {
  readonly paymentId: PaymentId
  readonly invoice: string | null
  /** The payment is still waiting for money. */
  readonly payable: boolean
  readonly expired: boolean
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const deviceId = useAtomValue(accountAtom).device.id

  const verify = useQuery({
    queryKey: ["lightningAddressVerify", paymentId],
    enabled: payable && invoice !== null,
    refetchInterval: VERIFY_POLL_INTERVAL_MS,
    queryFn: async () => {
      await using run = appRun()
      const result = await run(
        syncLightningAddressPayment({ paymentId, deviceId })
      )
      if (!result.ok) {
        // The wallet down or offline: the next poll, or the job, tries again.
        nativeConsole.debug("Lightning address verify failed", result.error)
        return null
      }
      return result.value
    },
  })

  return (
    <YStack gap={12} items="center" w="100%">
      {invoice !== null ? (
        <CopyableQrCode value={invoice} />
      ) : (
        <XStack items="center" gap={8}>
          <ActivityIndicator />
          <Text
            fontSize={fontSize.sm}
            lineHeight={fontSize.sm}
            color="muted-foreground"
          >
            {t("paymentWait.preparing.lightningAddress")}
          </Text>
        </XStack>
      )}
      {expired ? (
        <Text color="muted-foreground">{t("payment.status.expired")}</Text>
      ) : null}
      {verify.data === "unverified" ? (
        <XStack items="flex-start" gap={6} maxW={288}>
          <Icon icon={TriangleAlert} size={16} color="warning" />
          <Text
            flex={1}
            fontSize={fontSize.sm}
            lineHeight={fontSize.sm}
            color="warning"
          >
            {t("paymentWait.lightningAddress.unverified")}
          </Text>
        </XStack>
      ) : null}
      {payable && invoice !== null ? (
        <BoltCardReader paymentId={paymentId} method="lightningAddress" />
      ) : null}
    </YStack>
  )
}
