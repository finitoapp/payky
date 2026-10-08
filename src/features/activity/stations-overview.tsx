import { useTimeAgo, useTimestamp } from "@dedalik/use-react"
import { Link } from "@tanstack/react-router"
import { ChevronDownIcon, ChevronRightIcon, StoreIcon } from "lucide-react"
import { Suspense, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { type FiatCurrency, Integer } from "@/core/modules/shared/schema.ts"
import {
  type StationListRow,
  stationPaymentsInRangeQuery,
  stationsQuery,
} from "@/core/modules/station/station-queries.ts"
import {
  type StationPaymentSummary,
  summarizeStationPayments,
} from "@/core/modules/station/station-report-utils.ts"
import { ActivityHistorySkeleton } from "@/features/activity/activity-history-skeleton.tsx"
import { ActivityTabs } from "@/features/activity/activity-tabs.tsx"
import {
  resolveStationsOverviewRange,
  type StationsOverviewRange,
  stationsOverviewRanges,
} from "@/features/activity/stations-overview-range.ts"
import {
  StationWarnings,
  useStationChainWarnings,
  useStationReportStatus,
} from "@/features/shared/station-report-status.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"

const rangeLabelKeys = {
  today: "activity.stations.range.today",
  yesterday: "activity.stations.range.yesterday",
  last7Days: "activity.stations.range.last7Days",
  last30Days: "activity.stations.range.last30Days",
} satisfies Record<StationsOverviewRange, TranslationKey>

/** The owner's totals per PoS station over a range of days. */
export function StationsOverview() {
  const { t } = useTranslation()
  const [range, setRange] = useState<StationsOverviewRange>("today")

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("activity.title")} />

      <section className="flex flex-col gap-8">
        <ActivityTabs active="stations" />
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <ToggleGroup<StationsOverviewRange>
              value={[range]}
              onValueChange={([next]) => {
                if (next !== undefined) setRange(next)
              }}
              variant="outline"
              size="sm"
              className="w-max"
            >
              {stationsOverviewRanges.map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {t(rangeLabelKeys[value])}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Suspense fallback={<ActivityHistorySkeleton />}>
            <StationsOverviewContent range={range} />
          </Suspense>
        </div>
      </section>
    </>
  )
}

function StationsOverviewContent({
  range,
}: {
  readonly range: StationsOverviewRange
}) {
  const { t } = useTranslation()
  // Moves the range on at midnight; the query only changes when it does.
  const timestamp = useTimestamp({ interval: 60_000 })
  const { data: stations } = useEvoluQuery(stationsQuery)
  const { data: payments } = useEvoluQuery(
    stationPaymentsInRangeQuery(
      resolveStationsOverviewRange(range, new Date(timestamp))
    )
  )
  // Nothing writes a row when a payment expires; see `useNow`.
  const now = useNow(payments.map((payment) => payment.expiresAt))
  const summaries = summarizeStationPayments(payments, now)
  const summaryByStation = new Map(
    summaries.map((summary) => [summary.stationId, summary])
  )
  // A revoked station stays listed only while the range holds its payments.
  const shownStations = stations.filter(
    (station) => station.revokedAt === null || summaryByStation.has(station.id)
  )

  if (shownStations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <StoreIcon className="size-10 text-muted-foreground" />
        <p className="text-balance text-sm text-muted-foreground">
          {t("activity.stations.empty")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {shownStations.map((station) => (
        <StationOverviewCard
          key={station.id}
          station={station}
          summary={summaryByStation.get(station.id)}
        />
      ))}
    </div>
  )
}

function StationOverviewCard({
  station,
  summary,
}: {
  readonly station: StationListRow
  readonly summary: StationPaymentSummary | undefined
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { lastReportAt, chain } = useStationReportStatus(station)
  const lastReport = useTimeAgo(lastReportAt, { locale })
  const chainWarnings = useStationChainWarnings(chain)
  const unconfirmed = summary?.reportedPaidUnconfirmed ?? 0
  const warnings = [
    ...chainWarnings,
    ...(unconfirmed === 0
      ? []
      : [t("activity.stations.warning.unconfirmed", { count: unconfirmed })]),
  ]
  const totals = summary?.totals ?? []
  const byEmployee = summary?.byEmployee ?? []
  const money = (value: number, currency: FiatCurrency) =>
    formatMoney({ value: Integer(value), currency }, locale)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {station.name}{" "}
          <span className="font-normal text-muted-foreground">
            #{station.number}
          </span>
        </CardTitle>
        <CardDescription>
          {lastReportAt === null
            ? t("activity.stations.noReports")
            : t("activity.stations.lastReport", { time: lastReport })}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={t("activity.stations.openSettings", {
              name: station.name,
            })}
            render={
              <Link
                to="/settings/stations/$stationId"
                params={{ stationId: station.id }}
              />
            }
          >
            <ChevronRightIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {totals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("activity.stations.noPayments")}
          </p>
        ) : (
          totals.map((total) => (
            <div key={total.currency} className="flex flex-col gap-1">
              <strong className="text-2xl font-semibold tabular-nums">
                {money(total.amount, total.currency)}
              </strong>
              <span className="text-sm text-muted-foreground">
                {t("activity.stations.countAndTips", {
                  count: total.count,
                  tips: money(total.tips, total.currency),
                })}
              </span>
            </div>
          ))
        )}

        <StationWarnings warnings={warnings} />

        {byEmployee.length === 0 ? null : (
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
              {t("activity.stations.byEmployee")}
              <ChevronDownIcon
                aria-hidden
                className="size-4 transition-transform group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col divide-y pt-2">
              {byEmployee.map((row) => (
                <div
                  key={`${row.employeeId ?? ""}:${row.currency}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {row.employeeName ?? t("activity.stations.noEmployee")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("activity.stations.countAndTips", {
                        count: row.count,
                        tips: money(row.tips, row.currency),
                      })}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(row.amount, row.currency)}
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/activity" search={{ stationId: station.id }} />}
        >
          {t("activity.stations.showPayments")}
        </Button>
      </CardContent>
    </Card>
  )
}
