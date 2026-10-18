import type { TranslationKey } from "@payky/app-shared/i18n/resources"

type YearFormat = "default" | "short"
type DatePartFormat = "default" | "hidden"

export interface ToggleOption<Value extends string> {
  readonly value: Value
  readonly label: TranslationKey
  readonly description: TranslationKey
}

export const yearFormatOptions: ReadonlyArray<ToggleOption<YearFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.year.default.title",
    description: "settings.paymentNumberSeries.year.default.description",
  },
  {
    value: "short",
    label: "settings.paymentNumberSeries.year.short.title",
    description: "settings.paymentNumberSeries.year.short.description",
  },
]

export const monthFormatOptions: ReadonlyArray<ToggleOption<DatePartFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.month.default.title",
    description: "settings.paymentNumberSeries.month.default.description",
  },
  {
    value: "hidden",
    label: "settings.paymentNumberSeries.month.hidden.title",
    description: "settings.paymentNumberSeries.month.hidden.description",
  },
]

export const dayFormatOptions: ReadonlyArray<ToggleOption<DatePartFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.day.default.title",
    description: "settings.paymentNumberSeries.day.default.description",
  },
  {
    value: "hidden",
    label: "settings.paymentNumberSeries.day.hidden.title",
    description: "settings.paymentNumberSeries.day.hidden.description",
  },
]
