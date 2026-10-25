import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { syncLightningAddressPayment } from "@payky/core/modules/payment/payment-lightning-address-actions"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { TriangleAlertIcon } from "lucide-react"
import { accountAtom } from "@/atoms/account.ts"
import { BoltCardReader } from "@/features/payment-wait/payment-wait-bolt-card.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const VERIFY_POLL_INTERVAL_MS = 2_000

/**
 * The invoice the merchant's own wallet issued for this payment
 * (lightning-address/0001). While the tab is open and the payment waits, it
 * polls the wallet's LUD-21 verify URL every two seconds; the payment turns
 * paid through its claim, as Spark's does. The background job polls too, so
 * closing the screen loses nothing (lightning-address/0005).
 */
export function LightningAddressPaymentTab({
  paymentId,
  qrPayload,
  payable,
  boltCardPaymentId,
  preparingMessageKey,
}: {
  readonly paymentId: PaymentId
  readonly qrPayload: string | null
  /** The payment is still waiting for money. */
  readonly payable: boolean
  readonly boltCardPaymentId: PaymentId | null
  readonly preparingMessageKey: TranslationKey | null
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const console = useConsole()
  const deviceId = useAtomValue(accountAtom).device.id

  const verify = useQuery({
    queryKey: ["lightningAddressVerify", paymentId],
    enabled: payable && qrPayload !== null,
    refetchInterval: VERIFY_POLL_INTERVAL_MS,
    queryFn: async () => {
      await using run = appRun()
      const result = await run(
        syncLightningAddressPayment({ paymentId, deviceId })
      )
      if (!result.ok) {
        // The wallet down or offline: the next poll, or the job, tries again.
        console.debug("Lightning address verify failed", result.error)
        return null
      }
      return result.value
    },
  })

  return (
    <>
      <QrPaymentRequest
        qrPayload={qrPayload}
        preparingMessageKey={preparingMessageKey}
      />
      {verify.data === "unverified" ? (
        <p
          className="flex max-w-72 items-start gap-1.5 text-balance text-sm text-warning"
          role="status"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {t("paymentWait.lightningAddress.unverified")}
        </p>
      ) : null}
      {boltCardPaymentId !== null ? (
        <BoltCardReader
          paymentId={boltCardPaymentId}
          method="lightningAddress"
        />
      ) : null}
    </>
  )
}
