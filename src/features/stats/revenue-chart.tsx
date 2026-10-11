import { type ReactNode, useMemo } from "react"
import {
  Bar,
  BarChart,
  type BarShapeProps,
  CartesianGrid,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart.tsx"
import type { SalesByHourRow } from "@/core/modules/sales-stats/sales-stats-queries.ts"
import {
  type SalesBucket,
  type StatsPeriodRanges,
  salesBuckets,
  statsDelta,
} from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { minorUnitsToDecimalString } from "@/core/modules/shared/money.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatAmount } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"
import { formatStatsRange } from "./kpi-tiles.tsx"
import { StatsSection } from "./stats-section.tsx"

export interface RevenueChartPoint {
  /** Local start of the bucket, epoch ms. */
  readonly start: number
  /**
   * Gross sales (tips not included) in major units — the chart's scale, not
   * money to add up. `undefined` for a bucket still ahead of `now`, which
   * has no bar.
   */
  readonly sales: number | undefined
  /** The bucket's tips, stacked on top of `sales`. */
  readonly tips: number | undefined
  /**
   * The comparison bucket at the same position, sales and tips together, if
   * the comparison has one — what the change is figured against.
   */
  readonly previous: number | undefined
  /** `previous` split for its bar, the same way the current bar stacks. */
  readonly previousSales: number | undefined
  readonly previousTips: number | undefined
  readonly previousStart: number | undefined
}

/**
 * The bars and the comparison bars behind them, matched by position: the
 * n-th hour or day of the period against the n-th of its comparison. The
 * comparison covers its whole span, so on *Today* the hours still ahead
 * show only what sold a week earlier.
 */
export const revenueChartPoints = ({
  current,
  previous,
  currency,
  now,
}: {
  readonly current: ReadonlyArray<SalesBucket>
  readonly previous: ReadonlyArray<SalesBucket>
  readonly currency: Currency
  readonly now: Date
}): ReadonlyArray<RevenueChartPoint> => {
  const major = (value: number) =>
    Number(minorUnitsToDecimalString({ value: Integer(value), currency }))
  return current.map((bucket, index) => {
    const comparisonBucket = previous[index]
    const ahead = bucket.start.getTime() > now.getTime()
    return {
      start: bucket.start.getTime(),
      sales: ahead ? undefined : major(bucket.gross),
      tips: ahead ? undefined : major(bucket.tips),
      previous:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.gross + comparisonBucket.tips),
      previousSales:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.gross),
      previousTips:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.tips),
      previousStart: comparisonBucket?.start.getTime(),
    }
  })
}

/**
 * One part of the current bar, narrower than the comparison bar it stands
 * in front of.
 */
const CurrentBar = ({ x, y, width, height, fill }: BarShapeProps) => (
  <Rectangle
    x={x + width * 0.2}
    y={y}
    width={width * 0.6}
    height={height}
    fill={fill}
    radius={2}
  />
)

const comparisonColor =
  "color-mix(in oklch, var(--muted-foreground) 30%, transparent)"
/** The comparison's tips, lighter again, as the current bar's tips are. */
const comparisonTipsColor =
  "color-mix(in oklch, var(--muted-foreground) 14%, transparent)"
/** A lighter shade of the sales colour: the same money, the guest's extra. */
const tipsColor = "color-mix(in oklch, var(--chart-1) 45%, transparent)"

/**
 * Sales per hour for a one-day period, per day otherwise, in the account
 * currency (the first of the period's currencies), tips stacked on top.
 *
 * ponytail: a period with several currencies charts only the first; one
 * chart per currency if a mixed-currency shop ever needs it.
 */
export function RevenueChart({
  hourRows,
  comparisonHourRows,
  ranges,
  currency,
  now,
}: {
  readonly hourRows: ReadonlyArray<SalesByHourRow>
  /** Over `ranges.comparisonWhole`. */
  readonly comparisonHourRows: ReadonlyArray<SalesByHourRow>
  readonly ranges: StatsPeriodRanges
  readonly currency: Currency
  readonly now: Date
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
          range: ranges.comparisonWhole,
          unit,
        }),
        currency,
        now,
      }),
    [
      hourRows,
      comparisonHourRows,
      ranges.range,
      ranges.comparisonWhole,
      unit,
      currency,
      now,
    ]
  )

  const config = {
    sales: { label: t("stats.chart.sales"), color: "var(--chart-1)" },
    tips: { label: t("stats.chart.tips"), color: tipsColor },
    previousSales: {
      label: t("stats.chart.comparison"),
      color: comparisonColor,
    },
    previousTips: { label: t("stats.chart.tips"), color: comparisonTipsColor },
  } satisfies ChartConfig

  const tick = (start: number) =>
    unit === "hour"
      ? new Date(start).toLocaleTimeString(locale, { hour: "numeric" })
      : new Date(start).toLocaleDateString(locale, {
          day: "numeric",
          month: "numeric",
        })
  const bucketLabel = (start: number) =>
    unit === "hour"
      ? new Date(start).toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date(start).toLocaleDateString(locale, { dateStyle: "medium" })
  // An hour's comparison is the same hour on another day: its date says it.
  const previousLabel = (start: number | undefined) =>
    start === undefined
      ? config.previousSales.label
      : unit === "hour"
        ? new Date(start).toLocaleDateString(locale, {
            day: "numeric",
            month: "numeric",
          })
        : bucketLabel(start)

  return (
    <StatsSection title={t("stats.chart.title")}>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <BarChart
          data={[...points]}
          barCategoryGap="12%"
          margin={{ left: 0, right: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="start"
            tickFormatter={tick}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          {/* Its own axis, so the comparison bar takes the whole slot. */}
          <XAxis xAxisId="previous" dataKey="start" hide />
          <YAxis
            width="auto"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              value.toLocaleString(locale, { notation: "compact" })
            }
          />
          <ChartTooltip
            content={({ active, payload }) => {
              const point: RevenueChartPoint | undefined = payload?.[0]?.payload
              return active === true && point !== undefined ? (
                <RevenueTooltip
                  point={point}
                  title={bucketLabel(point.start)}
                  previousLabel={previousLabel(point.previousStart)}
                  currency={currency}
                />
              ) : null
            }}
          />
          {/* The raised zIndex draws it in front of the comparison (300). */}
          <Bar
            dataKey="sales"
            stackId="current"
            fill="var(--color-sales)"
            shape={CurrentBar}
            zIndex={301}
            isAnimationActive={false}
          />
          <Bar
            dataKey="tips"
            stackId="current"
            fill="var(--color-tips)"
            shape={CurrentBar}
            zIndex={301}
            isAnimationActive={false}
          />
          <Bar
            xAxisId="previous"
            dataKey="previousSales"
            stackId="previous"
            fill="var(--color-previousSales)"
            radius={2}
            isAnimationActive={false}
          />
          <Bar
            xAxisId="previous"
            dataKey="previousTips"
            stackId="previous"
            fill="var(--color-previousTips)"
            radius={2}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendItem
          color={config.sales.color}
          label={formatStatsRange(ranges.range, locale)}
        />
        <LegendItem color={config.tips.color} label={config.tips.label} />
        <LegendItem
          color={config.previousSales.color}
          label={formatStatsRange(ranges.comparisonWhole, locale)}
        />
      </div>
    </StatsSection>
  )
}

/** Sales, tips, their total and its change against the comparison. */
function RevenueTooltip({
  point,
  title,
  previousLabel,
  currency,
}: {
  readonly point: RevenueChartPoint
  readonly title: string
  readonly previousLabel: string
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const amount = (value: number) => formatAmount(value, currency, locale)
  const total =
    point.sales === undefined ? undefined : point.sales + (point.tips ?? 0)
  const ratio =
    total === undefined || point.previous === undefined
      ? null
      : statsDelta(total, point.previous).ratio

  return (
    <div className="grid min-w-40 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{title}</div>
      {total === undefined ? null : (
        <>
          <TooltipLine label={t("stats.chart.sales")}>
            {amount(point.sales ?? 0)}
          </TooltipLine>
          {point.tips === undefined || point.tips === 0 ? null : (
            <TooltipLine label={t("stats.chart.tips")}>
              {amount(point.tips)}
            </TooltipLine>
          )}
          <TooltipLine label={t("stats.chart.total")} strong>
            {amount(total)}
          </TooltipLine>
        </>
      )}
      {point.previous === undefined ? null : (
        <TooltipLine label={previousLabel}>
          {amount(point.previous)}
        </TooltipLine>
      )}
      {point.previousTips === undefined || point.previousTips === 0 ? null : (
        <TooltipLine label={t("stats.tips.ofWhich")} sub>
          {amount(point.previousTips)}
        </TooltipLine>
      )}
      {ratio === null ? null : (
        <TooltipLine label={t("stats.chart.change")}>
          {new Intl.NumberFormat(locale, {
            style: "percent",
            signDisplay: "exceptZero",
            maximumFractionDigits: 0,
          }).format(ratio)}
        </TooltipLine>
      )}
    </div>
  )
}

function TooltipLine({
  label,
  strong = false,
  sub = false,
  children,
}: {
  readonly label: string
  readonly strong?: boolean
  /** Indented under the line above, as a part of its amount. */
  readonly sub?: boolean
  readonly children: ReactNode
}) {
  return (
    <div className={cn("flex justify-between gap-3", sub && "pl-2")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", strong && "font-semibold")}>
        {children}
      </span>
    </div>
  )
}

function LegendItem({
  color,
  label,
}: {
  readonly color: string
  readonly label: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}
