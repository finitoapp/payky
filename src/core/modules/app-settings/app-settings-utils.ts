import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import {
  type DefaultPaymentMethod,
  DefaultPaymentMethodSchema,
} from "@/core/modules/app-settings/app-settings-types.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  defaultTipFixedAmounts,
  defaultTipPercentages,
  stringifyTipFixedAmounts,
  stringifyTipPercentages,
} from "./app-settings-tips.ts"

export const settingsId =
  createIdFromString<"AppSettings">("payky-app-settings")

/** A new profile opens payments on the bank transfer tab. */
export const defaultPaymentMethod: DefaultPaymentMethod = "iban"

export const defaultPaymentMethodOrder: ReadonlyArray<DefaultPaymentMethod> = [
  "cashRegister",
  "spark",
  "cashu",
  "iban",
]

export const createDefaultSettings = (): AppSettingsRow => ({
  id: settingsId,
  onboardingCompleted: null,
  fiatCurrency: FiatCurrency.CZK,
  tipsEnabled: sqliteTrue,
  presetTipPercentagesJson: stringifyTipPercentages(defaultTipPercentages),
  presetTipFixedAmountsJson: stringifyTipFixedAmounts(defaultTipFixedAmounts),
  paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
  defaultPaymentMethod,
})

export const getDefaultPaymentMethod = (
  value: DefaultPaymentMethod | undefined
): DefaultPaymentMethod => value ?? defaultPaymentMethod

/**
 * The method payments open on: the configured one while it is enabled,
 * otherwise the first enabled method in the terminal's tab order. Switching
 * the configured method off therefore hands the default to another method
 * without a write, and switching it back on restores it.
 */
export const resolveDefaultPaymentMethod = ({
  configured,
  enabledMethods,
  order,
}: {
  readonly configured: DefaultPaymentMethod | undefined
  readonly enabledMethods: ReadonlySet<DefaultPaymentMethod>
  readonly order: ReadonlyArray<DefaultPaymentMethod>
}): DefaultPaymentMethod | null => {
  const preferred = getDefaultPaymentMethod(configured)
  if (enabledMethods.has(preferred)) return preferred
  return order.find((method) => enabledMethods.has(method)) ?? null
}

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
