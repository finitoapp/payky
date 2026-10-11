import { ChartColumnIcon } from "lucide-react"
import { Suspense } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { verticalNavShellClassName } from "@/components/vertical-nav.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { getFiatCurrency } from "@/core/modules/app-settings/app-settings-utils.ts"
import type { StatsPeriod } from "@/core/modules/sales-stats/sales-stats-types.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"
import { DeviceBreakdown } from "./device-breakdown.tsx"
import { KpiTiles } from "./kpi-tiles.tsx"
import { ExpectedCashSummary, MethodBreakdown } from "./method-breakdown.tsx"
import { OpenBillsSummary } from "./open-bills-summary.tsx"
import { PeriodSelector } from "./period-selector.tsx"
import { RevenueChart } from "./revenue-chart.tsx"
import { SalesHeatmap } from "./sales-heatmap.tsx"
import { Signals } from "./signals.tsx"
import { type StatsSearch, statsPeriodFromSearch } from "./stats-search.ts"
import { TopCategories } from "./top-categories.tsx"
import { TopItems } from "./top-items.tsx"
import { useSalesStats, useStatsNow } from "./use-sales-stats.ts"
import { VatRecap } from "./vat-recap.tsx"

/**
 * The sales statistics screen (access/0008), header included: the period
 * selector, then one section per block, top to bottom. A new section is one
 * more component in `PeriodStats` (period-bound, fed by `useSalesStats` or
 * its own `useStatsRows`) or after it (not tied to the period).
 */
export function StatsPage({
  search,
  onSearchChange,
}: {
  readonly search: StatsSearch
  readonly onSearchChange: (search: StatsSearch) => void
}) {
  const { t } = useTranslation()
  const now = useStatsNow()
  const period = statsPeriodFromSearch(search, now)

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("stats.title")} />

      <div className="flex flex-col gap-6 pb-8">
        <PeriodSelector period={period} onChange={onSearchChange} />
        <Suspense fallback={<StatsSkeleton />}>
          <PeriodStats period={period} now={now} />
        </Suspense>
        <Suspense fallback={<ListSkeleton rows={1} />}>
          <OpenBills />
        </Suspense>
      </div>
    </>
  )
}

function PeriodStats({
  period,
  now,
}: {
  readonly period: StatsPeriod
  readonly now: Date
}) {
  const stats = useSalesStats(period, now)

  if (stats === null) return <StatsSkeleton />
  if (stats.kpis.length === 0) return <StatsEmpty />

  const [primary] = stats.kpis

  return (
    <>
      <KpiTiles
        kpis={stats.kpis}
        comparisonKpis={stats.comparisonKpis}
        comparison={stats.ranges.comparison}
        methods={stats.methods}
      />
      {primary === undefined ? null : (
        <RevenueChart
          hourRows={stats.hourRows}
          comparisonHourRows={stats.comparisonWholeHourRows}
          ranges={stats.ranges}
          currency={primary.currency}
          now={now}
        />
      )}
      <MethodBreakdown methods={stats.methods} />
      <ExpectedCashSummary cash={stats.cash} />
      <TopItems stats={stats} />
      <TopCategories stats={stats} />
      <DeviceBreakdown stats={stats} />
      {primary === undefined ? null : (
        <SalesHeatmap stats={stats} currency={primary.currency} />
      )}
      <Signals stats={stats} />
      <VatRecap stats={stats} />
    </>
  )
}

function OpenBills() {
  const {
    data: [settings],
  } = useEvoluQuery(settingsQuery)
  return <OpenBillsSummary accountCurrency={getFiatCurrency(settings)} />
}

function StatsEmpty() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <ChartColumnIcon className="size-10 text-muted-foreground" />
      <p className="font-medium">{t("stats.empty.title")}</p>
      <p className="text-balance text-sm text-muted-foreground">
        {t("stats.empty.description")}
      </p>
    </div>
  )
}

/** The KPI tiles and the chart's card, so the page does not jump on load. */
function StatsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
            key={index}
            className={cn(
              "flex flex-col gap-2 rounded-md bg-card p-3 shadow",
              index === 0 && "col-span-2"
            )}
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className={index === 0 ? "h-7 w-32" : "h-5 w-20"} />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
      <div className={cn(verticalNavShellClassName, "gap-4 p-4")}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full" />
      </div>
    </>
  )
}
