import { rowsByCurrency } from "@payky/app-shared/stats-sections"
import type {
  CategorySalesRow,
  KeypadSalesRow,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import type { Currency } from "@payky/core/modules/shared/schema"
import { useTranslation } from "@/hooks/use-translation.ts"
import { CurrencyGroup, StatsBarRow, useStatsMoney } from "./stats-section.tsx"

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

/** Per currency, the account currency first, currencies with no row left out. */
export const categoryGroups = ({
  categoryRows,
  keypadRows,
  accountCurrency,
}: {
  readonly categoryRows: ReadonlyArray<CategorySalesRow>
  readonly keypadRows: ReadonlyArray<KeypadSalesRow>
  readonly accountCurrency: Currency
}): ReadonlyArray<{
  readonly currency: Currency
  readonly rows: ReadonlyArray<CategoryShare>
}> =>
  rowsByCurrency([...categoryRows, ...keypadRows], accountCurrency)
    .map(({ currency }) => ({
      currency,
      rows: categoryShares({ categoryRows, keypadRows, currency }),
    }))
    .filter((group) => group.rows.length > 0)

/**
 * Revenue per catalog category, "Uncategorized" and the keypad's sales
 * without items included.
 */
export function TopCategories({
  groups,
}: {
  readonly groups: ReturnType<typeof categoryGroups>
}) {
  const { t } = useTranslation()
  const money = useStatsMoney()

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
