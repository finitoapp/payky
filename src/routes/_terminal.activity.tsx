import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDown,
  BarChart3,
  ChevronDown,
  MoreVertical,
  Timer,
} from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { HeaderStartLink } from "@/components/numopay-skeleton.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

export const activityItems = [
  {
    title: "activity.pending",
    date: "activity.first.date",
    amount: "activity.amount.usd",
  },
  {
    title: "activity.pending",
    date: "activity.second.date",
    amount: "activity.amount.usd",
  },
  {
    title: "activity.pending",
    date: "activity.third.date",
    amount: "activity.amount.btc",
  },
] as const

export const Route = createFileRoute("/_terminal/activity")({
  component: ActivityPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-6 py-6",
    },
  },
})

export function ActivityRow({
  title,
  date,
  amount,
}: {
  readonly title: string
  readonly date: string
  readonly amount: string
}) {
  const { t } = useTranslation()

  return (
    <article className="flex items-center gap-5">
      <div className="relative flex size-16 items-center justify-center rounded-full bg-card">
        <ArrowDown />
        <Badge className="-top-1 -left-1 absolute rounded-full bg-warning text-warning-foreground">
          <Timer />
        </Badge>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-base font-semibold text-muted-foreground">{date}</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold">{amount}</p>
        <p className="text-base font-semibold text-warning">
          {t("activity.resume")}
        </p>
      </div>
    </article>
  )
}

function ActivityPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("activity.title")}
        startAddon={<HeaderStartLink to="/" />}
        endAddon={
          <div className="flex items-center gap-3">
            <BarChart3 />
            <MoreVertical />
          </div>
        }
      />

      <section className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-base font-semibold text-muted-foreground">
          {t("activity.balance.label")}
        </p>
        <h1 className="text-6xl font-semibold tracking-normal">
          {t("home.amount")}
        </h1>
        <p className="text-xl text-muted-foreground">{t("home.sats")}</p>
      </section>

      <Button
        variant="ghost"
        className="mb-10 justify-start px-0 text-base font-semibold text-muted-foreground hover:bg-transparent"
      >
        {t("activity.filter")} <ChevronDown data-icon="inline-end" />
      </Button>

      <section className="flex flex-col gap-8">
        <h2 className="text-base font-semibold tracking-widest text-muted-foreground">
          {t("activity.month")}
        </h2>
        <div className="flex flex-col gap-7">
          {activityItems.map((item) => (
            <ActivityRow
              key={item.date}
              title={t(item.title)}
              date={t(item.date)}
              amount={t(item.amount)}
            />
          ))}
        </div>
      </section>
    </>
  )
}
