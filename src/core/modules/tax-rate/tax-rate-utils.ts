import {
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
} from "@/core/modules/shared/schema.ts"
import type { TaxRateRow } from "./tax-rate.ts"
import {
  type TaxRateId,
  TaxRatePercentage,
  type TaxRatePercentage as TaxRatePercentageType,
} from "./tax-rate-types.ts"

/**
 * Renders a `TaxRatePercentage` (hundredths of a percent) as the decimal
 * string a user would type, e.g. `2100` -> `"21"`, `1250` -> `"12.5"`.
 */
export const taxRatePercentageToDecimalString = (
  rate: TaxRatePercentageType
): string => {
  const whole = Math.floor(rate / 100)
  const hundredths = rate % 100

  if (hundredths === 0) return `${whole}`
  if (hundredths % 10 === 0) return `${whole}.${hundredths / 10}`
  return `${whole}.${hundredths.toString().padStart(2, "0")}`
}

/**
 * Parses a user-typed decimal percentage (comma or dot separator, up to two
 * decimal places) into a `TaxRatePercentage`. Returns `null` for anything
 * that isn't a valid 0-100% value at that precision.
 */
export const decimalStringToTaxRatePercentage = (
  value: string
): TaxRatePercentageType | null => {
  const normalized = value.trim().replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null

  const hundredths = Math.round(Number(normalized) * 100)
  if (!Number.isSafeInteger(hundredths) || hundredths > 10000) return null

  return TaxRatePercentage(hundredths)
}

/**
 * Archived rates are hidden from a tax-rate picker, except the one already
 * assigned to the item being edited — dropping it silently would look like
 * data loss, but it must not be offered as a fresh choice elsewhere.
 */
export const filterSelectableTaxRates = (
  taxRates: ReadonlyArray<TaxRateRow>,
  assignedTaxRateId: TaxRateId | null | undefined
): ReadonlyArray<TaxRateRow> =>
  taxRates.filter(
    (rate) => rate.deactivatedAt === null || rate.id === assignedTaxRateId
  )

export interface TaxSplit {
  readonly base: NonNegativeIntegerType
  readonly tax: NonNegativeIntegerType
}

/**
 * Splits a tax-inclusive line amount into its base (net) and tax portions
 * for one rate, rounding at the line level. Rekapitulace DPH sums already
 * rounded per-line results grouped by rate, matching the Czech convention
 * (never re-derives base+tax from a pre-summed group total).
 */
export const splitInclusiveAmount = (
  grossAmount: NonNegativeIntegerType,
  ratePercentage: TaxRatePercentageType
): TaxSplit => {
  if (ratePercentage === 0) {
    return { base: grossAmount, tax: NonNegativeInteger(0) }
  }

  const base = Math.round((grossAmount * 10000) / (10000 + ratePercentage))
  const tax = grossAmount - base

  return { base: NonNegativeInteger(base), tax: NonNegativeInteger(tax) }
}
