import { Link, Outlet } from "@tanstack/react-router"
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
} from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import { buttonVariants } from "@/components/ui/button-variants.ts"
import { useTranslation } from "@/i18n/use-translation.ts"
import { cn } from "@/lib/utils.ts"

export function RootLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-svh">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold"
          >
            <CircleDollarSign className="size-5 text-primary" />
            <span>{t("app.name")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              activeProps={{
                className: "bg-muted text-foreground",
              }}
            >
              {t("nav.home")}
            </Link>
            <Link
              to="/activity"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              activeProps={{
                className: "bg-muted text-foreground",
              }}
            >
              {t("nav.activity")}
            </Link>
          </nav>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function HomePage() {
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

export function ActivityPage() {
  const { t } = useTranslation()
  const items: ReadonlyArray<string> = [
    t("activity.feed.paid"),
    t("activity.feed.approved"),
    t("activity.feed.synced"),
  ]

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal">
          {t("activity.title")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("activity.description")}
        </p>
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {t("activity.empty")}
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-3 p-5">
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <Clock3 className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {item}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </li>
            ))}
          </ol>
        )}
      </div>
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
