import { orderCurrencies } from "@payky/core/modules/sales-stats/sales-stats-utils"
import type { Currency } from "@payky/core/modules/shared/schema"

/**
 * Rows split per currency, the account currency first, as the KPI tiles do.
 * Sections never add amounts across currencies.
 */
export const rowsByCurrency = <R extends { readonly currency: Currency }>(
  rows: ReadonlyArray<R>,
  accountCurrency: Currency
): ReadonlyArray<{
  readonly currency: Currency
  readonly rows: ReadonlyArray<R>
}> =>
  orderCurrencies(
    rows.map((row) => row.currency),
    accountCurrency
  ).map((currency) => ({
    currency,
    rows: rows.filter((row) => row.currency === currency),
  }))

/**
 * A heatmap cell's opacity of the chart colour: the busiest cell is solid,
 * every other in proportion with a visible floor, an empty one `0` (the
 * muted background shows instead).
 */
export const heatmapOpacity = (gross: number, max: number): number =>
  gross <= 0 || max <= 0 ? 0 : 0.15 + 0.85 * (gross / max)
