import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { CashuReceiveError } from "@payky/core/cashu/cashu-receive"
import {
  type CashuTokenArrival,
  cashuTokenArrivals,
} from "@payky/core/cashu/cashu-token-listener"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { RefreshCwIcon } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The Cashu tab (cashu.md §4): one BIP-321 QR a Lightning wallet pays as an
 * invoice. A quote the mint let expire offers a new one; the payment's own
 * status still comes from `payment.expiresAt`.
 */
const failureKeys = {
  MintUnreachable: "paymentWait.cashu.failure.mintUnreachable",
  MintRejected: "paymentWait.cashu.failure.mintRejected",
  TokenLocked: "paymentWait.cashu.failure.locked",
  TokenUndecodable: "paymentWait.cashu.failure.undecodable",
  TokenAlreadyKnown: "paymentWait.cashu.failure.alreadyKnown",
  AmountConsumedByFee: "paymentWait.cashu.failure.fee",
  ProofsSpent: "paymentWait.cashu.failure.spent",
  CounterLockTimeout: "paymentWait.cashu.failure.mintUnreachable",
} satisfies Record<CashuReceiveError["type"], TranslationKey>

/** What the wait screen says of a token sent for this payment (cashu.md §4). */
function CashuTokenArrivalNote({
  arrival,
}: {
  readonly arrival: CashuTokenArrival
}) {
  const { t } = useTranslation()
  const params = { amount: arrival.amount, mint: arrival.mint }
  const text =
    arrival.state === "untrustedMint"
      ? t("paymentWait.cashu.arrival.untrustedMint", params)
      : arrival.state === "failed"
        ? t(
            arrival.failure === null
              ? "paymentWait.cashu.failure.mintRejected"
              : failureKeys[arrival.failure]
          )
        : arrival.state === "waitingForMint"
          ? t("paymentWait.cashu.arrival.waitingForMint", params)
          : arrival.fee !== null && arrival.fee > 0
            ? t("paymentWait.cashu.arrival.withFee", {
                ...params,
                fee: arrival.fee,
              })
            : t("paymentWait.cashu.arrival.receiving", params)
  return (
    <p
      className="max-w-72 text-balance text-sm text-muted-foreground"
      role="status"
    >
      {text}
    </p>
  )
}

export function CashuPaymentTab({
  paymentId,
  qrPayload,
  quoteExpired,
  preparingMessageKey,
  newQuotePending,
  onNewQuote,
}: {
  readonly paymentId: PaymentId
  readonly qrPayload: string | null
  readonly quoteExpired: boolean
  readonly preparingMessageKey: TranslationKey | null
  readonly newQuotePending: boolean
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()
  const arrival = useSyncExternalStore(cashuTokenArrivals.subscribe, () =>
    cashuTokenArrivals.get(paymentId)
  )

  if (arrival !== null) return <CashuTokenArrivalNote arrival={arrival} />

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
