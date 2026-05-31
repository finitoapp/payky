import { createFileRoute } from "@tanstack/react-router"
import { ArrowRight, Clock3 } from "lucide-react"

import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
})

function ActivityPage() {
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
