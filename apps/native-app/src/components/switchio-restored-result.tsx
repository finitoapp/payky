import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { settleRestoredSwitchioCardPayment } from "@payky/core/modules/payment/payment-actions"
import type { SettleRestoredSwitchioCardPaymentError } from "@payky/core/modules/payment/payment-errors"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { accountAtom } from "../atoms/account.ts"
import { nativeConsole } from "../core/native-runtime.ts"
import { useAppRun } from "../hooks/use-app-run.ts"
import { useToast } from "../hooks/use-toast.ts"
import { useTranslation } from "../hooks/use-translation.ts"
import { takeRestoredSwitchioResult } from "../platform/switchio.ts"

const restoredErrorKeys = {
  SwitchioPaymentFailed: "paymentWait.cardPaid.error.declined",
  SwitchioUnavailable: "paymentWait.cardPaid.error.unavailable",
  SwitchioResultUnreadable: "paymentWait.cardPaid.restored.unresolved",
  SwitchioRestoredResultUnmatched: "paymentWait.cardPaid.restored.unresolved",
  PaymentNotFound: "paymentWait.cardPaid.restored.unresolved",
  CardSwitchioAccountNotFound: "paymentWait.cardPaid.restored.unresolved",
  AccountCurrencyMismatch: "paymentWait.cardPaid.restored.unresolved",
} satisfies Record<
  SettleRestoredSwitchioCardPaymentError["type"],
  TranslationKey
>

/**
 * Settles a SwitchioPay card result that arrived after Android killed the app
 * while the terminal was in the foreground, as web's `SwitchioRestoredResult`.
 * `MainActivity` stored the result before any JS ran; this takes it once the
 * app is up and records it through `settleRestoredSwitchioCardPayment`, whose
 * guards make a repeated result settle once. Without it a charged card would
 * stay unpaid in the app.
 *
 * Runs once per app start and per account: the result is cleared as it is
 * taken, so a failure to settle leaves the payment's own unresolved marker,
 * and a "verify in SwitchioPay" message, as the only trace.
 */
export function SwitchioRestoredResult() {
  const appRun = useAppRun()
  const deviceId = useAtomValue(accountAtom).device.id
  const toast = useToast()
  const { t } = useTranslation()

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per account, not on every new run/toast/t identity
  useEffect(() => {
    const restored = takeRestoredSwitchioResult()
    if (restored === null) return

    if (restored === "unusable") {
      nativeConsole.warn("[payment] Unusable restored Switchio result")
      toast.error(t("paymentWait.cardPaid.restored.unresolved"))
      return
    }

    void (async () => {
      await using run = appRun()
      const result = await run(
        settleRestoredSwitchioCardPayment({ restored, deviceId })
      )
      if (result.ok) {
        toast.success(t("paymentWait.cardPaid.restored.paid"))
      } else {
        nativeConsole.warn("[payment] Restored Switchio result", result.error)
        toast.error(t(restoredErrorKeys[result.error.type]))
      }
    })()
  }, [deviceId])

  return null
}
