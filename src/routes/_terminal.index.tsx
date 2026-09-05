import { sqliteTrue } from "@evolu/common"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Calculator, Clock3, LayoutGrid, Settings } from "lucide-react"
import { Suspense } from "react"
import { toast } from "sonner"
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
import { PosOverviewPage } from "@/features/pos/pos-overview-page.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTerminalHomeMode } from "@/hooks/use-terminal-home-mode.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    terminalLayout: {
      // Matches /settings's own top-level page width instead of a wider,
      // home-only inset — the tables/bills grid otherwise reads as wider
      // than every other screen in the app.
      viewportClassName: "px-3 py-6",
    },
  },
})

const Header = () => {
  const { t } = useTranslation()
  const [terminalHomeMode, setTerminalHomeMode] = useTerminalHomeMode()

  const toggleHomeMode = () => {
    setTerminalHomeMode(terminalHomeMode === "pos" ? "numpad" : "pos")
  }

  return (
    <header className="px-4 flex items-center justify-between">
      <Button
        variant={"ghost"}
        onClick={toggleHomeMode}
        aria-label={t(terminalHomeMode === "pos" ? "nav.numpad" : "nav.pos")}
      >
        {terminalHomeMode === "pos" ? (
          <Calculator className={"size-6"} strokeWidth={3} />
        ) : (
          <LayoutGrid className={"size-6"} strokeWidth={3} />
        )}
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
  const { t } = useTranslation()
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

    const created = await createTerminalPayment({
      amount,
      currency,
      tipAmount: NonNegativeInteger(0),
    })
    if (!created) toast.error(t("payment.create.error"))
  }

  return (
    <div className={"px-4 flex flex-1 flex-col justify-between"}>
      <div>&nbsp;</div>

      <TerminalPaymentKeypad
        currency={settings?.fiatCurrency ?? FiatCurrency.CZK}
        onCharge={handleCharge}
      />
    </div>
  )
}

function TerminalHomePage() {
  useScreenWakeLock(true)
  const [terminalHomeMode] = useTerminalHomeMode()
  const isNumpadMode = terminalHomeMode !== "pos"

  return (
    <div className={"flex flex-1 flex-col"}>
      <Header />

      <Suspense fallback={null}>
        {isNumpadMode ? <TerminalPaymentKeypadLoader /> : <PosOverviewPage />}
      </Suspense>
    </div>
  )
}
