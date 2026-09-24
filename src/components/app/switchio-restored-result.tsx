import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"
import { toast } from "sonner"

import { settleRestoredSwitchioCardPayment } from "@/core/modules/payment/payment-actions.ts"
import type { SettleRestoredSwitchioCardPaymentError } from "@/core/modules/payment/payment-errors.ts"
import {
  SWITCHIO_PLUGIN_NAME,
  SwitchioNativePayResultSchema,
} from "@/core/native/switchio.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

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
 * Settles a SwitchioPay card result that arrived after Android killed the
 * app while the terminal was in the foreground. Capacitor then resolves the
 * interrupted plugin call as an `appRestoredResult` event (retained until a
 * listener attaches) instead of the promise `payPaymentWithSwitchioCard` was
 * awaiting — without this, a charged card would stay unpaid in the app.
 */
export function SwitchioRestoredResult() {
  const appRun = useAppRun()
  const console = useConsole()
  const { t } = useTranslation()

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return undefined

    let disposed = false
    const listener = CapacitorApp.addListener(
      "appRestoredResult",
      async (event) => {
        if (event.pluginId !== SWITCHIO_PLUGIN_NAME) return

        const restored = SwitchioNativePayResultSchema.safeParse(event.data)
        if (!event.success || !restored.success) {
          console.warn("[payment] Unusable restored Switchio result", event)
          toast.error(t("paymentWait.cardPaid.restored.unresolved"))
          return
        }

        await using run = appRun()
        const result = await run(
          settleRestoredSwitchioCardPayment(restored.data)
        )
        if (result.ok) {
          toast.success(t("paymentWait.cardPaid.restored.paid"))
        } else {
          console.warn("[payment] Restored Switchio result", result.error)
          toast.error(t(restoredErrorKeys[result.error.type]))
        }
      }
    )

    return () => {
      disposed = true
      void (async () => {
        const handle = await listener
        if (disposed) {
          void handle.remove()
        }
      })()
    }
  }, [appRun, console, t])

  return null
}
