import { sqliteTrue } from "@evolu/common"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Clock3, Grid2X2, Settings } from "lucide-react"
import { Suspense } from "react"
import { TerminalPaymentKeypad } from "@/components/terminal-payment-keypad.tsx"
import { Button } from "@/components/ui/button.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  FiatCurrency,
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
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
  const navigate = useNavigate()
  const createTerminalPayment = useCreateTerminalPayment()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  const handleCharge = async (money: Money) => {
    const amount = NonNegativeInteger(money.value)
    const currency = FiatCurrencySchema.parse(money.currency)

    if (settings?.tipsEnabled === sqliteTrue) {
      await navigate({
        to: "/payment/tip",
        search: {
          amount,
          currency,
        },
      })
      return
    }

    await createTerminalPayment({
      amount,
      currency,
      tipAmount: NonNegativeInteger(0),
    })
  }

  return (
    <TerminalPaymentKeypad
      currency={settings?.fiatCurrency ?? FiatCurrency.CZK}
      onCharge={handleCharge}
    />
  )
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
