import { sqliteTrue } from "@evolu/common"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Calculator, Clock3, LayoutGrid, Settings } from "lucide-react"
import { LayoutGroup, motion } from "motion/react"
import { Suspense } from "react"
import {
  SlidingPillSegmentContent,
  slidingPillLayout,
  useSlidingPillTransition,
} from "@/components/sliding-pill.tsx"
import { Button } from "@/components/ui/button.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  FiatCurrency,
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { PosOverviewPage } from "@/features/terminal-home/pos-overview-page.tsx"
import { TerminalPaymentKeypad } from "@/features/terminal-home/terminal-payment-keypad.tsx"
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

const homeModeItems = [
  { mode: "numpad", icon: Calculator, label: "nav.numpad" },
  { mode: "pos", icon: LayoutGrid, label: "nav.pos" },
] as const

const Header = () => {
  const { t } = useTranslation()
  const [terminalHomeMode, setTerminalHomeMode] = useTerminalHomeMode()
  const transition = useSlidingPillTransition()

  return (
    <header className="px-4 flex items-center justify-between">
      {/*
       * Both modes stay on screen so the control reads as a switch rather
       * than a mystery icon; only the active one spells out its label, which
       * keeps "Klávesnice" from crowding the header on a phone. The motion
       * is `sliding-pill.tsx`'s.
       */}
      <LayoutGroup>
        <ToggleGroup
          value={[terminalHomeMode]}
          onValueChange={(value) => {
            // Tapping the already-active segment would empty the group.
            const [nextMode] = value
            if (nextMode !== undefined) setTerminalHomeMode(nextMode)
          }}
          // Not 0: the vendored group squares off joined segments at spacing 0.
          spacing={0.5}
          render={<motion.div {...slidingPillLayout(transition)} />}
          className="border border-input p-1"
        >
          {homeModeItems.map(({ mode, icon: Icon, label }) => {
            const active = mode === terminalHomeMode
            return (
              <ToggleGroupItem
                key={mode}
                value={mode}
                aria-label={t(label)}
                render={<motion.button {...slidingPillLayout(transition)} />}
                className="relative isolate h-9 min-w-9 gap-0 px-4 text-muted-foreground transition-colors duration-300 hover:bg-transparent aria-pressed:bg-transparent aria-pressed:text-background motion-reduce:transition-none"
              >
                <SlidingPillSegmentContent
                  active={active}
                  pillId="home-mode-pill"
                  icon={<Icon className="size-4" strokeWidth={2.5} />}
                  label={t(label)}
                />
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </LayoutGroup>
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
