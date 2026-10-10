import {
  type CategorySalesRow,
  categorySalesQuery,
  type KeypadSalesRow,
  keypadSalesQuery,
} from "@/core/modules/sales-stats/sales-stats-queries.ts"
import type { Currency } from "@/core/modules/shared/schema.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  CurrencyGroup,
  rowsByCurrency,
  StatsBarRow,
  StatsSection,
  useStatsMoney,
} from "./stats-section.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

export interface CategoryShare {
  readonly key: string
  /** `null` is "Uncategorized", unless `keypad`: the sales without items. */
  readonly name: string | null
  readonly keypad: boolean
  readonly amount: number
  /** Of the rows' total, 0..1. */
  readonly share: number
}

/**
 * One currency's categories and the keypad's "Without item" row, best
 * first, each with its share of their total.
 */
export const categoryShares = ({
  categoryRows,
  keypadRows,
  currency,
}: {
  readonly categoryRows: ReadonlyArray<CategorySalesRow>
  readonly keypadRows: ReadonlyArray<KeypadSalesRow>
  readonly currency: Currency
}): ReadonlyArray<CategoryShare> => {
  const rows = [
    ...categoryRows
      .filter((row) => row.currency === currency)
      .map((row) => ({
        key: row.categoryId ?? "uncategorized",
        name: row.categoryName,
        keypad: false,
        amount: row.amount,
      })),
    ...keypadRows
      .filter((row) => row.currency === currency && row.gross > 0)
      .map((row) => ({
        key: "keypad",
        name: null,
        keypad: true,
        amount: row.gross,
      })),
  ]
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return rows
    .map((row) => ({ ...row, share: total === 0 ? 0 : row.amount / total }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Revenue per catalog category, "Uncategorized" and the keypad's sales
 * without items included. The note says why none of it adds up to net
 * revenue.
 */
export function TopCategories({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const money = useStatsMoney()
  const categoryRows = useStatsRows(
    "categorySales",
    categorySalesQuery,
    stats.ranges.range,
    stats.live
  )
  const keypadRows = useStatsRows(
    "keypadSales",
    keypadSalesQuery,
    stats.ranges.range,
    stats.live
  )

  if (categoryRows === undefined || keypadRows === undefined) return null

  const groups = rowsByCurrency(
    [...categoryRows, ...keypadRows],
    stats.accountCurrency
  )
    .map(({ currency }) => ({
      currency,
      rows: categoryShares({ categoryRows, keypadRows, currency }),
    }))
    .filter((group) => group.rows.length > 0)

  if (groups.length === 0) return null

  return (
    <StatsSection
      title={t("stats.categories.title")}
      className="flex flex-col gap-4"
      note={t("stats.categories.note")}
    >
      {groups.map((group) => (
        <CurrencyGroup
          key={group.currency}
          currency={group.currency}
          showCurrency={groups.length > 1}
        >
          {group.rows.map((row) => (
            <StatsBarRow
              key={row.key}
              label={
                row.keypad
                  ? t("stats.categories.keypad")
                  : (row.name ?? t("stats.categories.uncategorized"))
              }
              value={money(row.amount, group.currency)}
              share={row.share}
            />
          ))}
        </CurrencyGroup>
      ))}
    </StatsSection>
  )
}
