import { RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * The Cashu tab (cashu.md §4): one BIP-321 QR a Lightning wallet pays as an
 * invoice. A quote the mint let expire offers a new one; the payment's own
 * status still comes from `payment.expiresAt`.
 */
export function CashuPaymentTab({
  qrPayload,
  quoteExpired,
  preparingMessageKey,
  newQuotePending,
  onNewQuote,
}: {
  readonly qrPayload: string | null
  readonly quoteExpired: boolean
  readonly preparingMessageKey: TranslationKey | null
  readonly newQuotePending: boolean
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()

  if (quoteExpired)
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="max-w-72 text-balance text-sm text-muted-foreground">
          {t("paymentWait.cashu.quoteExpired")}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={newQuotePending}
          onClick={onNewQuote}
        >
          <RefreshCwIcon />
          {t("paymentWait.cashu.newQuote")}
        </Button>
      </div>
    )

  return (
    <QrPaymentRequest
      qrPayload={qrPayload}
      preparingMessageKey={preparingMessageKey}
    />
  )
}
