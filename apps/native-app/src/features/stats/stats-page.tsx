import {
  type StatsSearch,
  StatsSearchSchema,
  statsPeriodFromSearch,
} from "@payky/app-shared/stats-search"
import type { StatsPeriod } from "@payky/core/modules/sales-stats/sales-stats-types"
import { statsPeriodRanges } from "@payky/core/modules/sales-stats/sales-stats-utils"
import { router, useLocalSearchParams } from "expo-router"
import { Suspense } from "react"
import { Text, YStack } from "tamagui"
import { Screen } from "../../components/screen.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { formatStatsRange, KpiTiles } from "./kpi-tiles.tsx"
import { PeriodSelector } from "./period-selector.tsx"
import {
  useSalesStats,
  useStatsLoadedAt,
  useStatsNow,
} from "./use-sales-stats.ts"

/**
 * The sales statistics screen (access/0008): the period selector, then one
 * section per block, top to bottom. The period lives in the route's params so
 * back and a restart keep it; every param falls back instead of throwing.
 */
export function StatsPage() {
  const { t } = useTranslation()
  const params = useLocalSearchParams<{
    period?: string
    from?: string
    to?: string
  }>()
  const search = StatsSearchSchema.parse(params)
  const now = useStatsNow()
  const period = statsPeriodFromSearch(search, now)

  return (
    <Screen>
      <ScreenHeader title={t("stats.title")} />
      <PeriodSelector
        period={period}
        onChange={(next: StatsSearch) => {
          router.setParams({
            period: next.period,
            from: next.from,
            to: next.to,
          })
        }}
      />
      <PeriodSummary period={period} now={now} />
      <Suspense fallback={<LoadingView />}>
        <PeriodStats period={period} now={now} />
      </Suspense>
    </Screen>
  )
}

/**
 * The exact range on screen and the one it compares with, then whether the
 * figures are live (*Today*) or when they loaded.
 */
function PeriodSummary({
  period,
  now,
}: {
  readonly period: StatsPeriod
  readonly now: Date
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { range, comparison } = statsPeriodRanges(period, now)
  const live = period.kind === "today"
  const loadedAt = useStatsLoadedAt(range)

  return (
    <YStack gap="1">
      <Text fontWeight="600">{formatStatsRange(range, locale)}</Text>
      <Text fontSize={12} color="muted-foreground">
        {t("stats.comparison", {
          range: formatStatsRange(comparison, locale),
        })}
      </Text>
      {live ? (
        <Text fontSize={12} color="green-600">
          {`● ${t("stats.live")}`}
        </Text>
      ) : loadedAt === undefined ? null : (
        <Text fontSize={12} color="muted-foreground">
          {t("stats.loadedAt", {
            time: new Date(loadedAt).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </Text>
      )}
    </YStack>
  )
}

function PeriodStats({
  period,
  now,
}: {
  readonly period: StatsPeriod
  readonly now: Date
}) {
  const { t } = useTranslation()
  const stats = useSalesStats(period, now)

  if (stats === null) return <LoadingView />
  if (stats.kpis.length === 0) {
    return (
      <YStack items="center" gap="2" py="8">
        <Text fontWeight="600">{t("stats.empty.title")}</Text>
        <Text color="muted-foreground" text="center">
          {t("stats.empty.description")}
        </Text>
      </YStack>
    )
  }

  return <KpiTiles kpis={stats.kpis} comparisonKpis={stats.comparisonKpis} />
}
