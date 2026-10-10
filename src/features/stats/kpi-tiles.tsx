import { startOfDay, subMilliseconds } from "date-fns"

import type { StatsRange } from "@/core/modules/sales-stats/sales-stats-types.ts"
import {
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

/** Net revenue, sales, average sale, tips and refunds, one set per currency. */
export function KpiTiles({
  kpis,
  comparisonKpis,
  comparison,
}: {
  readonly kpis: ReadonlyArray<SalesKpis>
  readonly comparisonKpis: ReadonlyArray<SalesKpis>
  readonly comparison: StatsRange
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
}: {
  readonly current: SalesKpis
  readonly previous: SalesKpis | undefined
  readonly showCurrency: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = (value: number, currency: Currency = current.currency) =>
    formatMoney({ value: Integer(value), currency }, locale)

  const tiles: ReadonlyArray<Tile> = [
    {
      label: "stats.kpi.netRevenue",
      value: money(current.netRevenue),
      current: current.netRevenue,
      previous: previous?.netRevenue ?? 0,
      upIsGood: true,
    },
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
    {
      label: "stats.kpi.tips",
      value: money(current.tips),
      current: current.tips,
      previous: previous?.tips ?? 0,
      upIsGood: true,
    },
    {
      label: "stats.kpi.refunds",
      value: t("stats.kpi.refundsValue", {
        count: current.refundCount.toLocaleString(locale),
        amount: money(current.refundAmount),
      }),
      current: current.refundAmount,
      previous: previous?.refundAmount ?? 0,
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
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            className={cn(
              "flex flex-col gap-1 rounded-md bg-card p-3 shadow",
              index === 0 && "col-span-2"
            )}
          >
            <p className="text-xs text-muted-foreground">{t(tile.label)}</p>
            <p
              className={cn(
                "font-semibold tabular-nums",
                index === 0 ? "text-2xl" : "text-base"
              )}
            >
              {tile.value}
            </p>
            <DeltaBadge tile={tile} locale={locale} />
          </div>
        ))}
      </div>
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
