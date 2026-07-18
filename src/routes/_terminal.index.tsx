import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { Clock3, Grid2X2, Settings } from "lucide-react"
import { Suspense } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { TerminalPaymentKeypadWithSettings } from "@/components/terminal-payment-keypad.tsx"
import { Button } from "@/components/ui/button.tsx"
import { createPreparedPayment } from "@/core/modules/payment/payment-actions.ts"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    terminalLayout: {
      viewportClassName: "justify-between px-8 py-6",
    },
  },
})

const Header = () => {
  const { t } = useTranslation()

  return (
    <header className="flex items-center justify-between">
      <Button
        variant={"ghost"}
        className={"invisible"}
        nativeButton={false}
        render={<Link aria-label={t("nav.checkout")} to="/checkout" />}
      >
        <Grid2X2 className={"size-6"} strokeWidth={3} />
      </Button>
      <div className="flex items-center gap-4">
        <Button
          nativeButton={false}
          variant={"ghost"}
          render={<Link aria-label={t("nav.activity")} to="/activity" />}
        >
          <Clock3 className={"size-6"} strokeWidth={3} />
        </Button>
        <Button
          nativeButton={false}
          variant={"ghost"}
          render={<Link aria-label={t("nav.settings")} to="/settings" />}
        >
          <Settings className={"size-6"} strokeWidth={3} />
        </Button>
      </div>
    </header>
  )
}

function TerminalPaymentKeypadLoader() {
  const appRun = useAppRun()
  const console = useConsole()
  const navigate = useNavigate()
  const jotaiStore = useStore()

  const handleCharge = async (money: Money) => {
    const { device } = await jotaiStore.get(accountAtom)

    await using run = appRun()

    const amount = NonNegativeInteger(money.value)
    const currency = FiatCurrencySchema.parse(money.currency)

    const result = await run(
      createPreparedPayment({
        deviceId: device.id,
        billId: null,
        tableId: null,
        amount,
        currency,
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
      })
    )

    if (!result.ok) {
      console.error("Failed to create prepared payment", result.error)
      return
    }

    await navigate({
      to: "/payment/$paymentId",
      params: {
        paymentId: result.value,
      },
    })
  }

  return <TerminalPaymentKeypadWithSettings onCharge={handleCharge} />
}

function TerminalHomePage() {
  useScreenWakeLock(true)

  return (
    <>
      <Header />

      <Suspense fallback={null}>
        <TerminalPaymentKeypadLoader />
      </Suspense>
    </>
  )
}
