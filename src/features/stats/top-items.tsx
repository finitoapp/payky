import { useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  type ItemSalesRow,
  itemSalesQuery,
} from "@/core/modules/sales-stats/sales-stats-queries.ts"
import type { Currency } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import {
  CurrencyGroup,
  rowsByCurrency,
  StatsBarRow,
  StatsSection,
  useStatsMoney,
} from "./stats-section.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

export type TopItemsMetric = "quantity" | "amount"

const metricLabelKeys = {
  amount: "stats.items.byRevenue",
  quantity: "stats.items.byQuantity",
} satisfies Record<TopItemsMetric, TranslationKey>

const topCount = 10

/** One currency's items, best first by `metric`, name breaking ties. */
export const rankItems = (
  rows: ReadonlyArray<ItemSalesRow>,
  metric: TopItemsMetric
): ReadonlyArray<ItemSalesRow> =>
  [...rows].sort(
    (a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name)
  )

/** What closed bills sold, by revenue or quantity: the top ten, then all. */
export function TopItems({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const rows = useStatsRows(
    "itemSales",
    itemSalesQuery,
    stats.ranges.range,
    stats.live
  )
  const [metric, setMetric] = useState<TopItemsMetric>("amount")
  const [showAll, setShowAll] = useState(false)

  if (rows === undefined || rows.length === 0) return null

  const groups = rowsByCurrency(rows, stats.accountCurrency)
  const hasMore = groups.some((group) => group.rows.length > topCount)

  return (
    <StatsSection
      title={t("stats.items.title")}
      className="flex flex-col gap-4"
    >
      <ToggleGroup<TopItemsMetric>
        aria-label={t("stats.items.metric")}
        className="grid w-full grid-cols-2"
        variant="outline"
        size="sm"
        spacing={1}
        value={[metric]}
        // Pressing the selected item again empties the value; keep it.
        onValueChange={([value]) => {
          if (value !== undefined) setMetric(value)
        }}
      >
        {(["amount", "quantity"] as const).map((value) => (
          <ToggleGroupItem key={value} value={value} className="text-xs">
            {t(metricLabelKeys[value])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {groups.map((group) => (
        <CurrencyGroup
          key={group.currency}
          currency={group.currency}
          showCurrency={groups.length > 1}
        >
          <ItemList
            rows={rankItems(group.rows, metric).slice(
              0,
              showAll ? undefined : topCount
            )}
            metric={metric}
            currency={group.currency}
          />
        </CurrencyGroup>
      ))}
      {hasMore ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? t("stats.items.showTop") : t("stats.items.showAll")}
        </Button>
      ) : null}
    </StatsSection>
  )
}

function ItemList({
  rows,
  metric,
  currency,
}: {
  readonly rows: ReadonlyArray<ItemSalesRow>
  readonly metric: TopItemsMetric
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useStatsMoney()
  // Bars against the best seller, so a long tail stays readable.
  const max = Math.max(0, ...rows.map((row) => row[metric]))

  return rows.map((row) => (
    <StatsBarRow
      key={row.catalogItemId ?? row.itemId}
      label={row.name}
      detail={t("stats.items.quantity", {
        quantity: row.quantity.toLocaleString(locale, {
          maximumFractionDigits: 3,
        }),
      })}
      value={money(row.amount, currency)}
      share={max === 0 ? 0 : row[metric] / max}
    />
  ))
}
