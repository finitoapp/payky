import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { CircleDollarSign } from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
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
