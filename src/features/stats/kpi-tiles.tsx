import { startOfDay, subMilliseconds } from "date-fns"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import type { StatsRange } from "@/core/modules/sales-stats/sales-stats-types.ts"
import {
  type SalesKpis,
  statsDelta,
} from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"
import { useStatsMoney } from "./stats-section.tsx"

/**
 * A comparison range for the caption under the tiles: whole days as dates,
 * a to-date range (it stops at the same time a week or month earlier) with
 * its end time.
 */
export const formatStatsRange = (range: StatsRange, locale: string) => {
  const from = new Date(range.fromIso)
  const to = new Date(range.toIso)
  const wholeDays = startOfDay(to).getTime() === to.getTime()
  return new Intl.DateTimeFormat(
    locale,
    wholeDays
      ? { dateStyle: "medium" }
      : { dateStyle: "medium", timeStyle: "short" }
  ).formatRange(from, wholeDays ? subMilliseconds(to, 1) : to)
}

interface Tile {
  readonly label: string
  readonly value: string
  readonly current: number
  readonly previous: number
  /** The change in the tile's own unit, sign included. */
  readonly formatDifference: (difference: number) => string
  /** A refund going up is bad news. */
  readonly upIsGood: boolean
}

/** Net revenue, then sales, average sale, tips and refunds — one set per currency. */
export function KpiTiles({
  kpis,
  comparisonKpis,
}: {
  readonly kpis: ReadonlyArray<SalesKpis>
  readonly comparisonKpis: ReadonlyArray<SalesKpis>
}) {
  return (
    <div className="flex flex-col gap-4">
      {kpis.map((current) => (
        <CurrencyKpis
          key={current.currency}
          current={current}
          previous={comparisonKpis.find(
            (kpi) => kpi.currency === current.currency
          )}
          showCurrency={kpis.length > 1}
        />
      ))}
    </div>
  )
}

function CurrencyKpis({
  current,
  previous,
  showCurrency,
}: {
  readonly current: SalesKpis
  readonly previous: SalesKpis | undefined
  readonly showCurrency: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const formatMoney = useStatsMoney()
  const money = (value: number) => formatMoney(value, current.currency)
  const signedMoney = (value: number) =>
    `${value > 0 ? "+" : ""}${money(value)}`
  const signedCount = (value: number) =>
    value.toLocaleString(locale, { signDisplay: "exceptZero" })

  const netRevenue: Tile = {
    label: t("stats.kpi.netRevenue"),
    value: money(current.netRevenue),
    current: current.netRevenue,
    previous: previous?.netRevenue ?? 0,
    formatDifference: signedMoney,
    upIsGood: true,
  }
  const tiles: ReadonlyArray<Tile> = [
    {
      label: t("stats.kpi.salesCount"),
      value: current.salesCount.toLocaleString(locale),
      current: current.salesCount,
      previous: previous?.salesCount ?? 0,
      formatDifference: signedCount,
      upIsGood: true,
    },
    {
      label: t("stats.kpi.averageSale"),
      value: money(current.averageSale),
      current: current.averageSale,
      previous: previous?.averageSale ?? 0,
      formatDifference: signedMoney,
      upIsGood: true,
    },
    {
      label: t("stats.kpi.breakdown.tips"),
      value: money(current.tips),
      current: current.tips,
      previous: previous?.tips ?? 0,
      formatDifference: signedMoney,
      upIsGood: true,
    },
    {
      label:
        current.refundCount === 0
          ? t("stats.kpi.breakdown.refunds")
          : t("stats.kpi.breakdown.refundsCount", {
              count: current.refundCount.toLocaleString(locale),
            }),
      value: money(current.refundAmount),
      current: current.refundAmount,
      previous: previous?.refundAmount ?? 0,
      formatDifference: signedMoney,
      upIsGood: false,
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      {showCurrency ? (
        <h2 className="px-1 text-xs font-bold text-muted-foreground">
          {current.currency}
        </h2>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1 rounded-md bg-card p-3 shadow">
          <p className="text-xs text-muted-foreground">{netRevenue.label}</p>
          <p className="text-3xl font-semibold tabular-nums">
            {netRevenue.value}
          </p>
          <DeltaBadge tile={netRevenue} />
          <Collapsible className="mt-1">
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t("stats.kpi.howCalculated")}
              <ChevronDownIcon
                aria-hidden
                className="size-3.5 transition-transform group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="mt-2 flex flex-col gap-1 border-t pt-2 text-sm">
                <BreakdownLine label={t("stats.kpi.breakdown.sales")}>
                  {money(current.gross)}
                </BreakdownLine>
                <BreakdownLine label={`− ${t("stats.kpi.breakdown.refunds")}`}>
                  {money(current.saleRefundAmount)}
                </BreakdownLine>
                <BreakdownLine label={`= ${netRevenue.label}`} total>
                  {netRevenue.value}
                </BreakdownLine>
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </div>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col gap-1 rounded-md bg-card p-3 shadow"
          >
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-semibold tabular-nums">{tile.value}</p>
            <DeltaBadge tile={tile} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function BreakdownLine({
  label,
  total = false,
  children,
}: {
  readonly label: string
  /** The line an equation comes to. */
  readonly total?: boolean
  readonly children: string
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3",
        total ? "font-semibold" : "text-muted-foreground"
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * The change against the comparison: an arrow, the percentage and the
 * difference itself, so it reads without the colour too.
 */
function DeltaBadge({ tile }: { readonly tile: Tile }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { ratio, difference } = statsDelta(tile.current, tile.previous)
  if (ratio === null) {
    return (
      <p className="text-xs text-muted-foreground">{t("stats.delta.none")}</p>
    )
  }
  const good = ratio === 0 ? null : ratio > 0 === tile.upIsGood
  const Arrow = ratio > 0 ? ArrowUpIcon : ratio < 0 ? ArrowDownIcon : null

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1 text-xs tabular-nums",
        good === null && "text-muted-foreground",
        good === true && "text-success",
        good === false && "text-destructive"
      )}
    >
      {Arrow === null ? null : <Arrow aria-hidden className="size-3" />}
      <span className="font-medium">
        {new Intl.NumberFormat(locale, {
          style: "percent",
          maximumFractionDigits: 0,
          signDisplay: "exceptZero",
        }).format(ratio)}
      </span>
      {difference === 0 ? null : (
        <span className="opacity-80">
          · {tile.formatDifference(difference)}
        </span>
      )}
    </p>
  )
}
