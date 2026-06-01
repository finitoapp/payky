import { createFileRoute, Link } from "@tanstack/react-router"
import { Clock3, Grid2X2, Settings } from "lucide-react"
import { TerminalPaymentKeypad } from "@/components/terminal-payment-keypad.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    terminalLayout: {
      mainClassName: "bg-[#00C245]",
      viewportClassName: "justify-between px-8 py-6",
    },
  },
})

function TerminalHomePage() {
  const { t } = useTranslation()

  return (
    <>
      <header className="flex items-center justify-between">
        <Button
          variant={"ghost"}
          render={<Link aria-label={t("nav.checkout")} to="/checkout" />}
        >
          <Grid2X2 className={"size-6"} strokeWidth={3} />
        </Button>
        <div className="flex items-center gap-4">
          <Button
            variant={"ghost"}
            render={<Link aria-label={t("nav.activity")} to="/activity" />}
          >
            <Clock3 className={"size-6"} strokeWidth={3} />
          </Button>
          <Button
            variant={"ghost"}
            render={<Link aria-label={t("nav.settings")} to="/settings" />}
          >
            <Settings className={"size-6"} strokeWidth={3} />
          </Button>
        </div>
      </header>

      <TerminalPaymentKeypad />
    </>
  )
}
