import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import { TaxRatePercentage } from "./tax-rate-types.ts"

export interface TaxRateSeed {
  readonly name: string
  readonly rate: ReturnType<typeof TaxRatePercentage>
  readonly isDefault: boolean
}

/**
 * 2024 Czech VAT reform: standard 21%, one merged reduced rate 12%, 0% for
 * exempt goods (e.g. books).
 */
const czechTaxRateSeed: ReadonlyArray<TaxRateSeed> = [
  { name: "Základní sazba", rate: TaxRatePercentage(2100), isDefault: true },
  { name: "Snížená sazba", rate: TaxRatePercentage(1200), isDefault: false },
  { name: "Osvobozeno od DPH", rate: TaxRatePercentage(0), isDefault: false },
]

/**
 * 2025 Slovak VAT reform: standard 23%, reduced 19% and 5%, 0% exempt.
 * Double-check these against current legislation before relying on them —
 * Slovak VAT rates changed recently and may change again.
 */
const slovakTaxRateSeed: ReadonlyArray<TaxRateSeed> = [
  { name: "Základná sadzba", rate: TaxRatePercentage(2300), isDefault: true },
  { name: "Znížená sadzba", rate: TaxRatePercentage(1900), isDefault: false },
  {
    name: "Znížená sadzba (potraviny)",
    rate: TaxRatePercentage(500),
    isDefault: false,
  },
  {
    name: "Osvobodené od DPH",
    rate: TaxRatePercentage(0),
    isDefault: false,
  },
]

const otherCountryTaxRateSeed: ReadonlyArray<TaxRateSeed> = []

export const getTaxRateSeedForCountry = (
  country: CountryCode | null
): ReadonlyArray<TaxRateSeed> => {
  switch (country) {
    case "CZ":
      return czechTaxRateSeed
    case "SK":
      return slovakTaxRateSeed
    case null:
      return otherCountryTaxRateSeed
  }
}
