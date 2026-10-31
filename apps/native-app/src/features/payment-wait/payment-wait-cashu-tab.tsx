import { NUT18_MAX_MINTS } from "@payky/core/cashu/cashu-payment-request"
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
import RefreshCw from "lucide-react-native/icons/refresh-cw"
import { type ReactNode, Suspense } from "react"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { fontSize } from "../../theme/tokens.ts"
import { cashuArrivalMessage } from "./cashu-arrival.ts"

/**
 * What became of a token sent for the payment; `children` while nothing did,
 * and beside it for an arrival that leaves the payment unpaid (cashu/0020).
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
  const { key, params } = cashuArrivalMessage(arrival)
  const note = (
    <Text
      maxW={288}
      fontSize={fontSize.sm}
      lineHeight={fontSize.sm}
      color="muted-foreground"
      text="center"
      role="alert"
    >
      {t(key, params)}
    </Text>
  )
  return cashuArrivalKeepsRequest(arrival.state) ? (
    <YStack gap={12} items="center">
      {children}
      {note}
    </YStack>
  ) : (
    note
  )
}

/**
 * A Lightning payment of this payment's that a contest gave to no one
 * (cashu/0029), read from synced facts; beside `children`, as an arrival
 * that leaves the payment unpaid is.
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
    <YStack gap={12} items="center">
      {children}
      <Text
        maxW={288}
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
        color="muted-foreground"
        text="center"
        role="alert"
      >
        {t("paymentWait.cashu.lightning.contested", {
          amount: topup.amount,
          mint: topup.mintUrl,
        })}
      </Text>
    </YStack>
  )
}

/**
 * The QR with the NUT-18 request naming the trusted mints, the default first
 * and capped (cashu/0016), read live.
 */
function TrustedMintsQrCode({
  buildQrPayload,
  fallback,
}: {
  readonly buildQrPayload: (mintUrls: ReadonlyArray<string>) => string | null
  readonly fallback: ReactNode
}) {
  const { data: trusted } = useEvoluQuery(cashuTrustedMintsQuery)
  const qrPayload = buildQrPayload(
    orderCashuRequestMints(trustedCashuMintsOf(trusted), NUT18_MAX_MINTS)
  )
  return qrPayload === null ? fallback : <CopyableQrCode value={qrPayload} />
}

/**
 * The Cashu tab (cashu/0006): one BIP-321 QR a Lightning wallet pays as an
 * invoice, or a Cashu wallet pays with a token over nostr. A quote the mint
 * let expire offers a new one; the payment's own status still comes from the
 * booked claims, never from what this tab shows of an arriving token. While
 * the trusted mints load, the request names the payment's mint only.
 */
export function CashuPaymentTab({
  paymentId,
  qrPayload,
  buildQrPayload,
  quoteExpired,
  newQuotePending,
  onNewQuote,
}: {
  readonly paymentId: PaymentId
  readonly qrPayload: string | null
  readonly buildQrPayload: (mintUrls: ReadonlyArray<string>) => string | null
  readonly quoteExpired: boolean
  readonly newQuotePending: boolean
  readonly onNewQuote: () => void
}) {
  const { t } = useTranslation()
  const request = quoteExpired ? (
    <YStack gap={12} items="center">
      <Text
        maxW={288}
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
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
  ) : qrPayload === null ? (
    <XStack items="center" gap={8}>
      <ActivityIndicator />
      <Text
        fontSize={fontSize.sm}
        lineHeight={fontSize.sm}
        color="muted-foreground"
      >
        {t("paymentWait.preparing.cashu")}
      </Text>
    </XStack>
  ) : (
    <CopyableQrCode value={qrPayload} />
  )

  return (
    <Suspense fallback={request}>
      <CashuContestedTopupNote paymentId={paymentId}>
        <CashuTokenArrivalNote paymentId={paymentId}>
          {quoteExpired || qrPayload === null ? (
            request
          ) : (
            <TrustedMintsQrCode
              buildQrPayload={buildQrPayload}
              fallback={request}
            />
          )}
        </CashuTokenArrivalNote>
      </CashuContestedTopupNote>
    </Suspense>
  )
}
