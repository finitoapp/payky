import { maxTipPresetCount } from "@payky/core/modules/app-settings/app-settings-tips"
import { decimalAmountToMinorUnits } from "@payky/core/modules/shared/money"
import {
  type FiatCurrency,
  PositiveIntegerFromStringSchema,
} from "@payky/core/modules/shared/schema"

export type TipPresetError =
  | "settings.tips.fixedAmounts.duplicate"
  | "settings.tips.fixedAmounts.invalid"
  | "settings.tips.fixedAmounts.maximum"
  | "settings.tips.percentages.duplicate"
  | "settings.tips.percentages.invalid"
  | "settings.tips.percentages.maximum"

export type AddTipPresetResult =
  | { readonly ok: true; readonly presets: ReadonlyArray<number> }
  | { readonly ok: false; readonly errorKey: TipPresetError }

const addPreset = (
  presets: ReadonlyArray<number>,
  value: number | null,
  keys: {
    readonly invalid: TipPresetError
    readonly duplicate: TipPresetError
    readonly maximum: TipPresetError
  }
): AddTipPresetResult => {
  if (value === null) return { ok: false, errorKey: keys.invalid }
  if (presets.includes(value)) return { ok: false, errorKey: keys.duplicate }
  if (presets.length === maxTipPresetCount) {
    return { ok: false, errorKey: keys.maximum }
  }
  return { ok: true, presets: [...presets, value] }
}

/** Adds a whole percentage from 1 to 100, refusing duplicates and a fifth preset. */
export const addTipPercentage = (
  percentages: ReadonlyArray<number>,
  input: string
): AddTipPresetResult => {
  const parsed = PositiveIntegerFromStringSchema.safeParse(input.trim())
  return addPreset(
    percentages,
    parsed.success && parsed.data <= 100 ? parsed.data : null,
    {
      invalid: "settings.tips.percentages.invalid",
      duplicate: "settings.tips.percentages.duplicate",
      maximum: "settings.tips.percentages.maximum",
    }
  )
}

/** Adds a fixed amount typed in the currency's decimals, stored in minor units. */
export const addTipFixedAmount = (
  fixedAmounts: ReadonlyArray<number>,
  input: string,
  currency: FiatCurrency
): AddTipPresetResult =>
  addPreset(
    fixedAmounts,
    decimalAmountToMinorUnits({ currency, value: input }),
    {
      invalid: "settings.tips.fixedAmounts.invalid",
      duplicate: "settings.tips.fixedAmounts.duplicate",
      maximum: "settings.tips.fixedAmounts.maximum",
    }
  )
