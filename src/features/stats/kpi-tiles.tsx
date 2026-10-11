import { startOfDay, subMilliseconds } from "date-fns"

import type { StatsRange } from "@/core/modules/sales-stats/sales-stats-types.ts"
import {
  type MethodBreakdown,
  type SalesKpis,
  statsDelta,
} from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

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
  readonly label: TranslationKey
  readonly value: string
  readonly current: number
  readonly previous: number
  /** A refund going up is bad news. */
  readonly upIsGood: boolean
}

/**
 * Net revenue with how it and the payment methods' total come out of the
 * same sales, then the number of sales and the average sale — one set per
 * currency.
 */
export function KpiTiles({
  kpis,
  comparisonKpis,
  comparison,
  methods,
}: {
  readonly kpis: ReadonlyArray<SalesKpis>
  readonly comparisonKpis: ReadonlyArray<SalesKpis>
  readonly comparison: StatsRange
  /** For the excess, so "received" matches the methods' donut. */
  readonly methods: ReadonlyArray<MethodBreakdown>
}) {
  const { t } = useTranslation()
  const locale = useLocale()

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
          excess={
            methods.find((row) => row.currency === current.currency)?.excess ??
            0
          }
        />
      ))}
      <p className="px-1 text-xs text-muted-foreground">
        {t("stats.comparison", {
          range: formatStatsRange(comparison, locale),
        })}
      </p>
    </div>
  )
}

function CurrencyKpis({
  current,
  previous,
  showCurrency,
  excess,
}: {
  readonly current: SalesKpis
  readonly previous: SalesKpis | undefined
  readonly showCurrency: boolean
  readonly excess: number
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = (value: number, currency: Currency = current.currency) =>
    formatMoney({ value: Integer(value), currency }, locale)

  const netRevenue: Tile = {
    label: "stats.kpi.netRevenue",
    value: money(current.netRevenue),
    current: current.netRevenue,
    previous: previous?.netRevenue ?? 0,
    upIsGood: true,
  }
  const tiles: ReadonlyArray<Tile> = [
    {
      label: "stats.kpi.salesCount",
      value: current.salesCount.toLocaleString(locale),
      current: current.salesCount,
      previous: previous?.salesCount ?? 0,
      upIsGood: true,
    },
    {
      label: "stats.kpi.averageSale",
      value: money(current.averageSale),
      current: current.averageSale,
      previous: previous?.averageSale ?? 0,
      upIsGood: true,
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
          <p className="text-xs text-muted-foreground">{t(netRevenue.label)}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {netRevenue.value}
          </p>
          <DeltaBadge tile={netRevenue} locale={locale} />
          {/*
           * Both totals the screen shows, out of the same sales: net revenue
           * here, and the payment methods' donut, which holds the tips and
           * has no refunds taken off.
           */}
          <dl className="mt-2 flex flex-col gap-3 border-t pt-3 text-sm">
            <div className="flex flex-col gap-1">
              <BreakdownLine label={t("stats.kpi.breakdown.sales")}>
                {money(current.gross)}
              </BreakdownLine>
              <BreakdownLine
                label={`− ${
                  current.refundCount === 0
                    ? t("stats.kpi.breakdown.refunds")
                    : t("stats.kpi.breakdown.refundsCount", {
                        count: current.refundCount.toLocaleString(locale),
                      })
                }`}
              >
                {money(current.saleRefundAmount)}
              </BreakdownLine>
              <BreakdownLine label={`= ${t(netRevenue.label)}`} total>
                {netRevenue.value}
              </BreakdownLine>
            </div>
            <div className="flex flex-col gap-1">
              <BreakdownLine label={t("stats.kpi.breakdown.sales")}>
                {money(current.gross)}
              </BreakdownLine>
              <BreakdownLine label={`+ ${t("stats.kpi.breakdown.tips")}`}>
                {money(current.tipsReceived)}
              </BreakdownLine>
              {excess === 0 ? null : (
                <BreakdownLine label={`+ ${t("stats.kpi.breakdown.excess")}`}>
                  {money(excess)}
                </BreakdownLine>
              )}
              <BreakdownLine
                label={`= ${t("stats.kpi.breakdown.received")}`}
                total
              >
                {money(current.gross + current.tipsReceived + excess)}
              </BreakdownLine>
              {current.tipRefundAmount === 0 ? null : (
                <p className="text-xs text-muted-foreground">
                  {t("stats.kpi.breakdown.tipRefunds", {
                    amount: money(current.tipRefundAmount),
                  })}
                </p>
              )}
            </div>
          </dl>
        </div>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col gap-1 rounded-md bg-card p-3 shadow"
          >
            <p className="text-xs text-muted-foreground">{t(tile.label)}</p>
            <p className="text-base font-semibold tabular-nums">{tile.value}</p>
            <DeltaBadge tile={tile} locale={locale} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownLine({
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

function DeltaBadge({
  tile,
  locale,
}: {
  readonly tile: Tile
  readonly locale: string
}) {
  const { ratio } = statsDelta(tile.current, tile.previous)
  if (ratio === null) {
    return <p className="text-xs text-muted-foreground">–</p>
  }
  const good = ratio === 0 ? null : ratio > 0 === tile.upIsGood

  return (
    <p
      className={cn(
        "text-xs tabular-nums",
        good === null && "text-muted-foreground",
        good === true && "text-success",
        good === false && "text-destructive"
      )}
    >
      {new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
      }).format(ratio)}
    </p>
  )
}
