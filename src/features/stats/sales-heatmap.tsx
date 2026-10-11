import { addDays, differenceInCalendarDays, setHours } from "date-fns"
import { useMemo } from "react"

import { salesHeatmap } from "@/core/modules/sales-stats/sales-stats-utils.ts"
import type { Currency } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { StatsSection, useStatsMoney } from "./stats-section.tsx"
import type { SalesStats } from "./use-sales-stats.ts"

/** 1 January 2024 was a Monday: the heatmap's first row. */
const aMonday = new Date(2024, 0, 1)
const hours = Array.from({ length: 24 }, (_, hour) => hour)

/**
 * A cell's opacity of the chart colour: the busiest cell is solid, every
 * other in proportion with a visible floor, an empty one `0` (the muted
 * background shows instead).
 */
export const heatmapOpacity = (gross: number, max: number): number =>
  gross <= 0 || max <= 0 ? 0 : 0.15 + 0.85 * (gross / max)

/**
 * Gross sales by local weekday (Monday first) and hour, for periods of
 * seven days and longer — a shorter one has a single sample per cell at
 * best. In one currency, the first of the period's, as the chart.
 */
export function SalesHeatmap({
  stats,
  currency,
}: {
  readonly stats: SalesStats
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useStatsMoney()
  const { range } = stats.ranges

  const matrix = useMemo(
    () => salesHeatmap(stats.hourRows, currency),
    [stats.hourRows, currency]
  )

  const days = differenceInCalendarDays(
    new Date(range.toIso),
    new Date(range.fromIso)
  )
  if (days < 7) return null

  const takings = (cell: (typeof matrix)[number][number]) =>
    cell.gross + cell.tips
  const max = Math.max(0, ...matrix.flat().map(takings))
  const weekday = (index: number, style: "short" | "long") =>
    addDays(aMonday, index).toLocaleDateString(locale, { weekday: style })
  const hourLabel = (hour: number) =>
    setHours(aMonday, hour).toLocaleTimeString(locale, { hour: "numeric" })

  return (
    <StatsSection title={t("stats.heatmap.title")}>
      <div className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-px text-[10px] text-muted-foreground">
        {matrix.map((row, dayIndex) => (
          <div key={weekday(dayIndex, "long")} className="contents">
            <span className="pr-1 leading-4">{weekday(dayIndex, "short")}</span>
            {row.map((cell, hour) => {
              const params = {
                weekday: weekday(dayIndex, "long"),
                hour: setHours(aMonday, hour).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                amount: money(takings(cell), currency),
                count: cell.count.toLocaleString(locale),
              }
              const label =
                cell.tips === 0
                  ? t("stats.heatmap.cell", params)
                  : t("stats.heatmap.cellTips", {
                      ...params,
                      tips: money(cell.tips, currency),
                    })
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour row
                  key={hour}
                  role="img"
                  aria-label={label}
                  title={label}
                  className="relative h-4 overflow-hidden rounded-[2px] bg-muted"
                >
                  <span
                    className="absolute inset-0 bg-chart-1"
                    style={{ opacity: heatmapOpacity(takings(cell), max) }}
                  />
                </span>
              )
            })}
          </div>
        ))}
        <span />
        {hours.map((hour) => (
          <span key={hour} className="overflow-visible whitespace-nowrap pt-1">
            {hour % 6 === 0 ? hourLabel(hour) : null}
          </span>
        ))}
      </div>
    </StatsSection>
  )
}
