import { useMemo } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx"
import type { SalesByHourRow } from "@/core/modules/sales-stats/sales-stats-queries.ts"
import {
  type SalesBucket,
  type StatsPeriodRanges,
  salesBuckets,
} from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { minorUnitsToDecimalString } from "@/core/modules/shared/money.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatAmount } from "@/lib/format-utils.ts"
import { StatsSection } from "./stats-section.tsx"

export interface RevenueChartPoint {
  /** Local start of the bucket, epoch ms. */
  readonly start: number
  /** Gross sales in major units — the chart's scale, not money to add up. */
  readonly current: number
  /** The comparison bucket at the same position, if the comparison has one. */
  readonly previous: number | undefined
}

/**
 * The bars and the faint comparison line, matched by position: the n-th
 * hour or day of the period against the n-th of its comparison. *Today*'s
 * comparison stops at the same time a week earlier, so its line ends where
 * the day has got to.
 */
export const revenueChartPoints = ({
  current,
  previous,
  currency,
}: {
  readonly current: ReadonlyArray<SalesBucket>
  readonly previous: ReadonlyArray<SalesBucket>
  readonly currency: Currency
}): ReadonlyArray<RevenueChartPoint> => {
  const major = (gross: number) =>
    Number(minorUnitsToDecimalString({ value: Integer(gross), currency }))
  return current.map((bucket, index) => {
    const comparisonBucket = previous[index]
    return {
      start: bucket.start.getTime(),
      current: major(bucket.gross),
      previous:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.gross),
    }
  })
}

/**
 * Sales per hour for a one-day period, per day otherwise, in the account
 * currency (the first of the period's currencies).
 *
 * ponytail: a period with several currencies charts only the first; one
 * chart per currency if a mixed-currency shop ever needs it.
 */
export function RevenueChart({
  hourRows,
  comparisonHourRows,
  ranges,
  currency,
}: {
  readonly hourRows: ReadonlyArray<SalesByHourRow>
  readonly comparisonHourRows: ReadonlyArray<SalesByHourRow>
  readonly ranges: StatsPeriodRanges
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const unit = ranges.bucket

  const points = useMemo(
    () =>
      revenueChartPoints({
        current: salesBuckets({
          rows: hourRows,
          currency,
          range: ranges.range,
          unit,
        }),
        previous: salesBuckets({
          rows: comparisonHourRows,
          currency,
          range: ranges.comparison,
          unit,
        }),
        currency,
      }),
    [
      hourRows,
      comparisonHourRows,
      ranges.range,
      ranges.comparison,
      unit,
      currency,
    ]
  )

  const config = {
    current: { label: t("stats.chart.current"), color: "var(--chart-1)" },
    previous: {
      label: t("stats.chart.previous"),
      color: "var(--muted-foreground)",
    },
  } satisfies ChartConfig

  const tick = (start: number) =>
    unit === "hour"
      ? new Date(start).toLocaleTimeString(locale, { hour: "numeric" })
      : new Date(start).toLocaleDateString(locale, {
          day: "numeric",
          month: "numeric",
        })

  return (
    <StatsSection title={t("stats.chart.title")}>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <ComposedChart data={[...points]} margin={{ left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="start"
            tickFormatter={tick}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            width="auto"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              value.toLocaleString(locale, { notation: "compact" })
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const start = payload[0]?.payload?.start
                  return typeof start === "number"
                    ? unit === "hour"
                      ? new Date(start).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : new Date(start).toLocaleDateString(locale, {
                          dateStyle: "medium",
                        })
                    : null
                }}
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {name === "previous"
                        ? config.previous.label
                        : config.current.label}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatAmount(Number(value), currency, locale)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="current"
            fill="var(--color-current)"
            radius={2}
            isAnimationActive={false}
          />
          <Line
            dataKey="previous"
            type="monotone"
            stroke="var(--color-previous)"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </StatsSection>
  )
}
