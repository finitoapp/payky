import { payPaymentWithBoltCard } from "@payky/core/modules/payment/payment-actions"
import type { PayPaymentWithBoltCardError } from "@payky/core/modules/payment/payment-errors"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { AppState } from "react-native"
import { Text, YStack } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import {
  getNfcStatus,
  type NfcStatus,
  openNfcSettings,
  startNfcReading,
} from "../../platform/nfc.ts"

/**
 * How long a card's accepted withdrawal may take to show up as a settled
 * invoice before staff is told to tap again. The Spark sync reports a
 * Lightning receive within seconds; its fallback history recheck runs every
 * 60 s, so this leaves room for one of those.
 */
const SETTLEMENT_TIMEOUT_MS = 75_000

const boltCardErrorKeys = {
  PaymentNotFound: "paymentWait.boltCard.error.generic",
  PaymentNotPayable: "paymentWait.boltCard.error.notPayable",
  PaymentLightningInvoiceNotFound: "paymentWait.boltCard.error.generic",
  LnurlWithdrawUnsupportedUri: "paymentWait.boltCard.error.unsupportedCard",
  LnurlWithdrawAmountOutOfRange: "paymentWait.boltCard.error.amountOutOfRange",
  LnurlHttpError: "paymentWait.boltCard.error.generic",
  LnurlResponseError: "paymentWait.boltCard.error.generic",
  FetchError: "paymentWait.boltCard.error.network",
} as const satisfies Record<
  Exclude<PayPaymentWithBoltCardError["type"], "LnurlRequestError">,
  string
>

// Payments with a withdrawal in flight. Module scope, so switching tabs (which
// remounts the reader and resets its ref) cannot start a second one.
const inFlightPayments = new Set<PaymentId>()

type BoltCardState =
  | { readonly step: "ready" }
  | { readonly step: "processing" }
  | { readonly step: "awaitingSettlement" }
  | { readonly step: "failed"; readonly message: string }

/**
 * Listens for a Bolt Card under the Lightning QR and pays the invoice from
 * it, as web's `BoltCardReader`. Mount it only while the payment is pending
 * and has a Lightning invoice: mounting turns the reader on, unmounting (a
 * paid payment, another tab, leaving the screen) turns it off. Success needs
 * no UI of its own: the page switches to paid once the sync sees the invoice
 * settle. Not verified with a real card.
 */
export function BoltCardReader({
  paymentId,
}: {
  readonly paymentId: PaymentId
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const [state, setState] = useState<BoltCardState>({ step: "ready" })
  const [nfcStatus, setNfcStatus] = useState<NfcStatus>(getNfcStatus)
  // A tap during a request (or while its payment is settling) is ignored; a
  // ref, because two taps can land before React re-renders. This is what
  // keeps a double tap from starting two withdrawals.
  const busyRef = useRef(false)

  // NFC is switched on in system settings, so re-read it on the way back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") setNfcStatus(getNfcStatus())
    })
    return () => subscription.remove()
  }, [])

  const handleTag = useEffectEvent(async (uri: string | null) => {
    if (busyRef.current || inFlightPayments.has(paymentId)) return
    busyRef.current = true

    if (uri === null) {
      busyRef.current = false
      setState({
        step: "failed",
        message: t("paymentWait.boltCard.error.unsupportedCard"),
      })
      return
    }

    setState({ step: "processing" })
    inFlightPayments.add(paymentId)
    try {
      await using run = appRun()
      const result = await run(payPaymentWithBoltCard({ paymentId, uri }))

      if (result.ok) {
        setState({ step: "awaitingSettlement" })
        return
      }

      // Only the type: some errors carry the card's URI or the server's body.
      nativeConsole.warn("Bolt Card payment failed", result.error.type)
      busyRef.current = false
      setState({
        step: "failed",
        message:
          result.error.type === "LnurlRequestError"
            ? t("paymentWait.boltCard.error.rejected", {
                reason: result.error.message,
              })
            : t(boltCardErrorKeys[result.error.type]),
      })
    } catch (error) {
      nativeConsole.error("Bolt Card payment failed", error)
      busyRef.current = false
      setState({
        step: "failed",
        message: t("paymentWait.boltCard.error.generic"),
      })
    } finally {
      inFlightPayments.delete(paymentId)
    }
  })

  useEffect(() => {
    if (nfcStatus !== "enabled") return
    try {
      return startNfcReading((uri) => void handleTag(uri))
    } catch (error) {
      nativeConsole.error("Could not start the NFC reader", error)
      return undefined
    }
  }, [nfcStatus])

  useEffect(() => {
    if (state.step !== "awaitingSettlement") return

    const timeout = setTimeout(() => {
      busyRef.current = false
      setState({
        step: "failed",
        message: t("paymentWait.boltCard.error.timeout"),
      })
    }, SETTLEMENT_TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [state.step, t])

  if (nfcStatus === "unsupported") return null

  if (nfcStatus === "disabled") {
    return (
      <YStack gap="2" items="center">
        <Text color="muted-foreground" text="center">
          {t("paymentWait.boltCard.disabled")}
        </Text>
        <Button
          size="sm"
          label={t("paymentWait.boltCard.enable")}
          variant="outline"
          onPress={openNfcSettings}
        />
      </YStack>
    )
  }

  return state.step === "failed" ? (
    <Text color="red-600" text="center" accessibilityRole="alert">
      {state.message}
    </Text>
  ) : (
    <Text
      color="muted-foreground"
      text="center"
      accessibilityLiveRegion="polite"
    >
      {t(
        state.step === "ready"
          ? "paymentWait.boltCard.ready"
          : state.step === "processing"
            ? "paymentWait.boltCard.processing"
            : "paymentWait.boltCard.awaitingSettlement"
      )}
    </Text>
  )
}
