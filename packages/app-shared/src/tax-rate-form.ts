import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type NonEmptyString255,
  NonEmptyString255Schema,
} from "@payky/core/modules/shared/schema"
import { decimalStringToTaxRatePercentage } from "@payky/core/modules/tax-rate/tax-rate-utils"

export type TaxRateFormResult =
  | {
      readonly ok: true
      readonly name: NonEmptyString255
      readonly rate: NonNullable<
        ReturnType<typeof decimalStringToTaxRatePercentage>
      >
    }
  | {
      readonly ok: false
      readonly field: "name" | "rate"
      readonly errorKey: TranslationKey
    }

/** Validates the "add a tax rate" form: the name first, then the rate. */
export const parseTaxRateForm = (input: {
  readonly name: string
  readonly rate: string
}): TaxRateFormResult => {
  const name = NonEmptyString255Schema.safeParse(input.name.trim())
  if (!name.success) {
    return {
      ok: false,
      field: "name",
      errorKey: "settings.taxRates.name.invalid",
    }
  }
  const rate = decimalStringToTaxRatePercentage(input.rate)
  if (rate === null) {
    return {
      ok: false,
      field: "rate",
      errorKey: "settings.taxRates.rate.invalid",
    }
  }
  return { ok: true, name: name.data, rate }
}
