import { App } from "@capacitor/app"
import { useQuery } from "@tanstack/react-query"
import { LoaderCircleIcon, NfcIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { payPaymentWithBoltCard } from "@/core/modules/payment/payment-actions.ts"
import type { PayPaymentWithBoltCardError } from "@/core/modules/payment/payment-errors.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { vibrateDevice } from "@/core/native/haptics.ts"
import {
  getNfcStatus,
  openNfcSettings,
  startNfcReading,
} from "@/core/native/nfc.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * How long a card's accepted withdrawal may take to show up as a settled
 * invoice before staff is told to tap again. The Spark sync reports a
 * Lightning receive within seconds; its fallback history recheck runs every
 * 60 s, so this leaves room for one of those.
 */
const SETTLEMENT_TIMEOUT_MS = 75_000

const tagReadVibrationMs = 50

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

type BoltCardState =
  | { readonly step: "ready" }
  | { readonly step: "processing" }
  | { readonly step: "awaitingSettlement" }
  | { readonly step: "failed"; readonly message: string }

/**
 * Listens for a Bolt Card under the Lightning QR and pays the invoice from
 * it. Mount it only while the payment is pending and has a Lightning invoice
 * — mounting is what turns the reader on, unmounting (a paid payment, another
 * tab) turns it off. Success needs no UI of its own: the page switches to
 * paid once the sync sees the invoice settle.
 */
export function BoltCardReader({
  paymentId,
}: {
  readonly paymentId: PaymentId
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const console = useConsole()
  const [state, setState] = useState<BoltCardState>({ step: "ready" })
  // A tap during a request (or while its payment is settling) is ignored;
  // a ref, because two taps can land before React re-renders.
  const busyRef = useRef(false)

  const nfcStatusQuery = useQuery({
    queryKey: ["nfcStatus"],
    queryFn: getNfcStatus,
  })
  const { refetch: refetchNfcStatus } = nfcStatusQuery

  // NFC is switched on in system settings, so re-read it on the way back.
  useEffect(() => {
    const listener = App.addListener("resume", () => {
      void refetchNfcStatus()
    })
    return () => {
      void (async () => (await listener).remove())()
    }
  }, [refetchNfcStatus])

  const handleTag = useEffectEvent(async (uri: string | null) => {
    if (busyRef.current) return
    busyRef.current = true
    void vibrateDevice(tagReadVibrationMs)

    if (uri === null) {
      busyRef.current = false
      setState({
        step: "failed",
        message: t("paymentWait.boltCard.error.unsupportedCard"),
      })
      return
    }

    setState({ step: "processing" })
    try {
      await using run = appRun()
      const result = await run(payPaymentWithBoltCard({ paymentId, uri }))

      if (result.ok) {
        setState({ step: "awaitingSettlement" })
        return
      }

      console.warn("Bolt Card payment failed", result.error)
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
      console.error("Bolt Card payment failed", error)
      busyRef.current = false
      setState({
        step: "failed",
        message: t("paymentWait.boltCard.error.generic"),
      })
    }
  })

  useEffect(() => {
    let disposed = false
    let stopReading: (() => Promise<void>) | undefined

    void (async () => {
      try {
        const stop = await startNfcReading((uri) => {
          void handleTag(uri)
        })
        if (disposed) await stop()
        else stopReading = stop
      } catch (error) {
        console.error("Could not start the NFC reader", error)
      }
    })()

    return () => {
      disposed = true
      void stopReading?.()
    }
  }, [console])

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

  const nfcStatus = nfcStatusQuery.data
  if (nfcStatus === undefined || nfcStatus === "unsupported") return null

  if (nfcStatus === "disabled") {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <p className="flex max-w-72 items-center gap-2 text-balance">
          <NfcIcon className="size-4 shrink-0" />
          {t("paymentWait.boltCard.disabled")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openNfcSettings()}
        >
          {t("paymentWait.boltCard.enable")}
        </Button>
      </div>
    )
  }

  return (
    <p
      role="status"
      className="flex max-w-72 items-center gap-2 text-balance text-sm text-muted-foreground"
    >
      {state.step === "ready" ? (
        <>
          <NfcIcon className="size-4 shrink-0 animate-pulse text-foreground motion-reduce:animate-none" />
          {t("paymentWait.boltCard.ready")}
        </>
      ) : state.step === "failed" ? (
        <span className="flex items-center gap-2 font-medium text-destructive">
          <TriangleAlertIcon className="size-4 shrink-0" />
          {state.message}
        </span>
      ) : (
        <>
          <LoaderCircleIcon className="size-4 shrink-0 animate-spin" />
          {t(
            state.step === "processing"
              ? "paymentWait.boltCard.processing"
              : "paymentWait.boltCard.awaitingSettlement"
          )}
        </>
      )}
    </p>
  )
}
