import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { NUT18_MAX_MINTS } from "@payky/core/cashu/cashu-payment-request"
import type { CashuReceiveError } from "@payky/core/modules/cashu/cashu-errors"
import {
  cashuTokenArrivalQuery,
  cashuTrustedMintsQuery,
} from "@payky/core/modules/cashu/cashu-queries"
import {
  cashuArrivalKeepsRequest,
  orderCashuRequestMints,
  trustedCashuMintsOf,
} from "@payky/core/modules/cashu/cashu-utils"
import { paymentCashuContestedTopupsQuery } from "@payky/core/modules/payment/payment-queries"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { RefreshCwIcon } from "lucide-react"
import { type ReactNode, Suspense } from "react"
import { Button } from "@/components/ui/button.tsx"
import { QrPaymentRequest } from "@/features/payment-wait/payment-wait-qr-request.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const failureKeys = {
  MintUnreachable: "paymentWait.cashu.failure.mintUnreachable",
  MintRejected: "paymentWait.cashu.failure.mintRejected",
  CashuMintUnsupported: "paymentWait.cashu.failure.unsupported",
  TokenLocked: "paymentWait.cashu.failure.locked",
  TokenUndecodable: "paymentWait.cashu.failure.undecodable",
  TokenAlreadyKnown: "paymentWait.cashu.failure.alreadyKnown",
  AmountConsumedByFee: "paymentWait.cashu.failure.fee",
  CounterLockTimeout: "paymentWait.cashu.failure.mintUnreachable",
  CashuReclaimAmbiguous: "paymentWait.cashu.failure.mintUnreachable",
  TokenPending: "paymentWait.cashu.failure.mintUnreachable",
} satisfies Record<CashuReceiveError["type"], TranslationKey>

/** The stored refusal's message; an unknown one reads as the mint's refusal. */
const failureKeyOf = (failure: string | null): TranslationKey =>
  failure !== null && Object.hasOwn(failureKeys, failure)
    ? failureKeys[failure as keyof typeof failureKeys]
    : "paymentWait.cashu.failure.mintRejected"

/**
 * What the wait screen says of a token sent for this payment, from the
 * local-only `_cashuTokenArrival`; `children` while there is none, and
 * beside it for an arrival that leaves the payment unpaid (cashu/0020).
 */
function CashuTokenArrivalNote({
  paymentId,
  children,
}: {
  readonly paymentId: PaymentId
  readonly children: ReactNode
}) {
  const { t } = useTranslation()
  const {
    data: [arrival],
  } = useEvoluQuery(cashuTokenArrivalQuery(paymentId))
  if (arrival === undefined) return children
  const params = { amount: arrival.amount, mint: arrival.mintUrl }
  const text =
    arrival.state === "untrustedMint"
      ? t("paymentWait.cashu.arrival.untrustedMint", params)
      : arrival.state === "failed"
        ? t(failureKeyOf(arrival.failure))
        : arrival.state === "waitingForMint"
          ? t("paymentWait.cashu.arrival.waitingForMint", params)
          : arrival.state === "receivingElsewhere"
            ? t("paymentWait.cashu.arrival.receivingElsewhere", params)
            : arrival.state === "checkingElsewhere"
              ? t("paymentWait.cashu.arrival.checkingElsewhere", params)
              : arrival.state === "receivedElsewhere"
                ? t("paymentWait.cashu.arrival.receivedElsewhere", params)
                : arrival.state === "contested"
                  ? t("paymentWait.cashu.arrival.contested", params)
                  : arrival.fee !== null && arrival.fee > 0
                    ? t("paymentWait.cashu.arrival.withFee", {
                        ...params,
                        fee: arrival.fee,
                      })
                    : t("paymentWait.cashu.arrival.receiving", params)
  const note = (
    <p
      className="max-w-72 text-balance text-sm text-muted-foreground"
      role="status"
    >
      {text}
    </p>
  )
  return cashuArrivalKeepsRequest(arrival.state) ? (
    <div className="flex flex-col items-center gap-3">
      {children}
      {note}
    </div>
  ) : (
    note
  )
}

/**
 * What the wait screen says of a Lightning payment of this payment's that a
 * contest gave to no one (cashu/0029), read from synced facts; beside
 * `children`, as an arrival that leaves the payment unpaid is.
 */
function CashuContestedTopupNote({
  paymentId,
  children,
}: {
  readonly paymentId: PaymentId
  readonly children: ReactNode
}) {
  const { t } = useTranslation()
  const {
    data: [topup],
  } = useEvoluQuery(paymentCashuContestedTopupsQuery(paymentId))
  if (topup === undefined) return children
  return (
    <div className="flex flex-col items-center gap-3">
      {children}
      <p
        className="max-w-72 text-balance text-sm text-muted-foreground"
        role="status"
      >
        {t("paymentWait.cashu.lightning.contested", {
          amount: topup.amount,
          mint: topup.mintUrl,
        })}
      </p>
    </div>
  )
}

/**
 * The QR with the NUT-18 request naming the trusted mints, the default first
 * and capped (cashu/0016), read live.
 */
function TrustedMintsQrRequest({
  buildQrPayload,
  preparingMessageKey,
}: {
  readonly buildQrPayload: (mintUrls: ReadonlyArray<string>) => string | null
  readonly preparingMessageKey: TranslationKey | null
}) {
  const { data: trusted } = useEvoluQuery(cashuTrustedMintsQuery)
  return (
    <QrPaymentRequest
      qrPayload={buildQrPayload(
        orderCashuRequestMints(trustedCashuMintsOf(trusted), NUT18_MAX_MINTS)
      )}
      preparingMessageKey={preparingMessageKey}
    />
  )
}

/**
 * The Cashu tab (cashu/0006): one BIP-321 QR a Lightning wallet pays as an
 * invoice. A quote the mint let expire offers a new one; the payment's own
 * status still comes from `payment.expiresAt`. What became of a token sent
 * for the payment replaces the QR while it pays, or may still pay, the
 * payment; one that leaves it unpaid is said beside it (cashu/0020); while the trusted mints load, the QR shows
 * its request naming the payment's mint only.
 */
export function CashuPaymentTab({
  paymentId,
  qrPayload,
  buildQrPayload,
  quoteExpired,
  preparingMessageKey,
  newQuotePending,
  onNewQuote,
}: {
  readonly paymentId: PaymentId
  readonly qrPayload: string | null
  readonly buildQrPayload: (mintUrls: ReadonlyArray<string>) => string | null
  readonly quoteExpired: boolean
  readonly preparingMessageKey: TranslationKey | null
  readonly newQuotePending: boolean
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()
  const request = quoteExpired ? (
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
  ) : (
    <QrPaymentRequest
      qrPayload={qrPayload}
      preparingMessageKey={preparingMessageKey}
    />
  )

  return (
    <Suspense fallback={request}>
      <CashuContestedTopupNote paymentId={paymentId}>
        <CashuTokenArrivalNote paymentId={paymentId}>
          {quoteExpired || qrPayload === null ? (
            request
          ) : (
            <TrustedMintsQrRequest
              buildQrPayload={buildQrPayload}
              preparingMessageKey={preparingMessageKey}
            />
          )}
        </CashuTokenArrivalNote>
      </CashuContestedTopupNote>
    </Suspense>
  )
}
