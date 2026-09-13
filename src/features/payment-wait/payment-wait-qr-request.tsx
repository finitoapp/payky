import { CopyableQrCode } from "@/components/copyable-qr-code.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function QrPaymentRequest({
  qrPayload,
  preparingMessageKey,
}: {
  readonly qrPayload: string | null
  readonly preparingMessageKey: TranslationKey | null
}) {
  const { t } = useTranslation()

  return (
    <CopyableQrCode
      {...(qrPayload !== null
        ? { state: "ready" as const, value: qrPayload }
        : preparingMessageKey !== null
          ? { state: "pending" as const, pendingLabel: t(preparingMessageKey) }
          : { state: "empty" as const })}
      ariaLabel={t("paymentWait.copyQr")}
      copiedMessage={t("paymentWait.qrCopied")}
      copyFailedMessage={t("paymentWait.qrCopyFailed")}
    />
  )
}
