import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import {
  type DefaultPaymentMethod,
  DefaultPaymentMethodSchema,
} from "@/core/modules/app-settings/app-settings-types.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"

export const settingsId =
  createIdFromString<"AppSettings">("payky-app-settings")

export const defaultPaymentMethod: DefaultPaymentMethod = "spark"

export const defaultPaymentMethodOrder: ReadonlyArray<DefaultPaymentMethod> = [
  "cashRegister",
  "spark",
  "iban",
]

export const createDefaultSettings = (): AppSettingsRow => ({
  id: settingsId,
  onboardingCompleted: null,
  fiatCurrency: FiatCurrency.CZK,
  tipsEnabled: sqliteTrue,
  presetTipPercentagesJson: JSON.stringify([5, 10, 15]),
  presetTipFixedAmountsJson: JSON.stringify([2000, 5000]),
  paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
  defaultPaymentMethod,
})

export const isDefaultPaymentMethod = (
  value: unknown
): value is DefaultPaymentMethod =>
  DefaultPaymentMethodSchema.safeParse(value).success

export const getDefaultPaymentMethod = (
  value: DefaultPaymentMethod | undefined
): DefaultPaymentMethod => value ?? defaultPaymentMethod

export const parsePaymentMethodOrder = (
  value: string | null | undefined
): ReadonlyArray<DefaultPaymentMethod> => {
  if (value === null || value === undefined) {
    return defaultPaymentMethodOrder
  }

  try {
    const parsedJson: unknown = JSON.parse(value)
    const parsed = DefaultPaymentMethodSchema.array().safeParse(parsedJson)
    if (!parsed.success) return defaultPaymentMethodOrder

    const uniqueMethods = parsed.data.filter(
      (method, index, methods) => methods.indexOf(method) === index
    )
    const missingMethods = defaultPaymentMethodOrder.filter(
      (method) => !uniqueMethods.includes(method)
    )

    return [...uniqueMethods, ...missingMethods]
  } catch {
    return defaultPaymentMethodOrder
  }
}
