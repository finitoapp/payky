import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const { t } = useTranslation()

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-h-80 flex-col justify-between rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">{t("app.name")}</p>
          <h1 className="max-w-xl text-3xl font-semibold tracking-normal">
            {t("home.title")}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("home.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button>{t("home.request")}</Button>
          <Button variant="outline">{t("home.settle")}</Button>
        </div>
      </div>

      <aside className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("home.balance.label")}
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {t("home.balance.value")}
            </p>
          </div>
          <span className="rounded-full bg-success/15 p-2 text-success">
            <CheckCircle2 className="size-5" />
          </span>
        </div>
        <div className="mt-8 grid gap-3">
          <BalanceBar className="w-4/5" />
          <BalanceBar className="w-3/5" />
          <BalanceBar className="w-11/12" />
        </div>
      </aside>
    </section>
  )
}

function BalanceBar({ className }: { readonly className: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full bg-primary", className)} />
    </div>
  )
}
