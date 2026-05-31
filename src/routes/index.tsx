import { createFileRoute, Link } from "@tanstack/react-router"
import { Clock3, Grid2X2, Settings } from "lucide-react"
import { PhoneViewport } from "@/components/numopay-skeleton.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/")({
  component: TerminalHomePage,
})

export const keypad = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "C",
  "0",
  "<",
]

function TerminalHomePage() {
  const { t } = useTranslation()

  return (
    <main
      className="min-h-svh bg-green-500 text-foreground"
      style={{
        backgroundColor: "#00C245",
      }}
    >
      <PhoneViewport className="justify-between px-8 py-6">
        <header className="flex items-center justify-between">
          <Button
            variant={"ghost"}
            render={<Link aria-label={t("nav.checkout")} to="/checkout" />}
          >
            <Grid2X2 />
          </Button>
          <div className="flex items-center gap-4">
            <Button
              variant={"ghost"}
              render={<Link aria-label={t("nav.activity")} to="/activity" />}
            >
              <Clock3 />
            </Button>
            <Button
              variant={"ghost"}
              render={<Link aria-label={t("nav.settings")} to="/settings" />}
            >
              <Settings />
            </Button>
          </div>
        </header>

        <section className="flex flex-col items-center gap-5 text-center">
          <h1 className="text-6xl font-semibold tracking-normal">
            {t("home.amount")}
          </h1>
          <p className="text-xl text-foreground/80">{t("home.sats")}</p>
        </section>

        <section className="grid grid-cols-3 gap-x-12 gap-y-6 px-8">
          {keypad.map((key) => (
            <Button
              key={key}
              variant="ghost"
              className="h-16 rounded-full text-2xl text-foreground hover:bg-primary-foreground/10"
            >
              {key}
            </Button>
          ))}
        </section>

        <Button
          className="h-14 rounded-full bg-primary-foreground/15 text-base text-foreground hover:bg-primary-foreground/20"
          disabled
        >
          {t("home.charge")}
        </Button>
      </PhoneViewport>
    </main>
  )
}
