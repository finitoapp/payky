import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { TaxRateRow } from "@/core/modules/tax-rate/tax-rate.ts"
import {
  type TaxRateId,
  TaxRatePercentage,
} from "@/core/modules/tax-rate/tax-rate-types.ts"
import { splitInclusiveAmount } from "@/core/modules/tax-rate/tax-rate-utils.ts"

export interface TaxRecapRow {
  /** `null` groups lines that carry no tax rate at all. */
  readonly taxRateId: TaxRateId | null
  /** `null` only when `taxRateId` is `null`. */
  readonly name: string | null
  readonly ratePercentage: TaxRatePercentage | null
  readonly baseAmount: number
  readonly taxAmount: number
  readonly grossAmount: number
}

/**
 * Groups already-computed bill/payment line summaries by their frozen
 * `taxRateId`, splitting each line's gross amount into base+tax at the
 * line level (rounding per line, then summing — the Czech convention, never
 * re-derived from a pre-summed group total). Rows follow `taxRates`' own
 * `sortOrder`. A line whose `taxRateId` isn't found in `taxRates` is
 * excluded from the recap entirely rather than shown as a blank row — this
 * is reachable in this local-first app when a device renders a bill before
 * a newly-created tax rate has synced from another device.
 */
export const calculateTaxRecap = (
  summaries: ReadonlyArray<Pick<BillLineSummary, "taxRateId" | "totalAmount">>,
  taxRates: ReadonlyArray<Pick<TaxRateRow, "id" | "name" | "rate">>
): ReadonlyArray<TaxRecapRow> => {
  const totalsByTaxRateId = new Map<
    TaxRateId | null,
    { base: number; tax: number; gross: number }
  >()

  for (const summary of summaries) {
    const taxRate =
      summary.taxRateId === null
        ? undefined
        : taxRates.find((rate) => rate.id === summary.taxRateId)
    if (summary.taxRateId !== null && taxRate === undefined) continue

    const ratePercentage = taxRate?.rate ?? TaxRatePercentage(0)
    const split = splitInclusiveAmount(summary.totalAmount, ratePercentage)

    const key = summary.taxRateId
    const existing = totalsByTaxRateId.get(key) ?? { base: 0, tax: 0, gross: 0 }
    totalsByTaxRateId.set(key, {
      base: existing.base + split.base,
      tax: existing.tax + split.tax,
      gross: existing.gross + summary.totalAmount,
    })
  }

  const rows: TaxRecapRow[] = []

  for (const taxRate of taxRates) {
    const sums = totalsByTaxRateId.get(taxRate.id)
    if (sums === undefined) continue

    rows.push({
      taxRateId: taxRate.id,
      name: taxRate.name,
      ratePercentage: taxRate.rate,
      baseAmount: sums.base,
      taxAmount: sums.tax,
      grossAmount: sums.gross,
    })
  }

  const noTaxSums = totalsByTaxRateId.get(null)
  if (noTaxSums !== undefined) {
    rows.push({
      taxRateId: null,
      name: null,
      ratePercentage: null,
      baseAmount: noTaxSums.base,
      taxAmount: noTaxSums.tax,
      grossAmount: noTaxSums.gross,
    })
  }

  return rows
}

/**
 * Whether a tax recap has any taxed line to show. Shared by `TaxRecap`
 * itself and by pages that decide whether to render a separator/heading
 * around it.
 */
export const hasTaxableLines = (
  rows: ReadonlyArray<Pick<TaxRecapRow, "taxRateId">>
): boolean => rows.some((row) => row.taxRateId !== null)
