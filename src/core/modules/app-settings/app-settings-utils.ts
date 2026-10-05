import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import {
  type DefaultPaymentMethod,
  DefaultPaymentMethodSchema,
  type TerminalHomeMode,
  TerminalHomeModeSchema,
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

export const defaultPaymentMethod: DefaultPaymentMethod = "spark"

export const defaultPaymentMethodOrder: ReadonlyArray<DefaultPaymentMethod> = [
  "cashRegister",
  "spark",
  "iban",
  "cardSwitchio",
]

/**
 * `enabledHomeModesJson` is left out: `null` already means every mode, which
 * also offers a mode added later to anyone who never narrowed the set.
 */
export const createDefaultSettings = (): Omit<
  AppSettingsRow,
  "enabledHomeModesJson"
> => ({
  id: settingsId,
  onboardingCompleted: null,
  fiatCurrency: FiatCurrency.CZK,
  tipsEnabled: sqliteTrue,
  presetTipPercentagesJson: stringifyTipPercentages(defaultTipPercentages),
  presetTipFixedAmountsJson: stringifyTipFixedAmounts(defaultTipFixedAmounts),
  paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
  defaultPaymentMethod,
})

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

/**
 * The order payment methods are offered in, with the default one first.
 * `setPaymentMethodOrder` keeps the two in step; settings written before it
 * (onboarding stores them independently) get the default moved to the front,
 * which is the tab they already opened first.
 */
export const getPaymentMethodOrder = (
  settings:
    | {
        readonly paymentMethodOrderJson: string
        readonly defaultPaymentMethod: DefaultPaymentMethod
      }
    | undefined
): ReadonlyArray<DefaultPaymentMethod> => {
  const order = parsePaymentMethodOrder(settings?.paymentMethodOrderJson)
  if (settings === undefined) return order

  const first = settings.defaultPaymentMethod
  return [first, ...order.filter((method) => method !== first)]
}

/** Every home-screen mode, in the fixed order the header lists them. */
export const terminalHomeModes: ReadonlyArray<TerminalHomeMode> =
  TerminalHomeModeSchema.options

/**
 * The enabled home-screen modes, in `terminalHomeModes` order. `null`, an
 * unreadable value and an empty set all mean every mode, so the home screen
 * always has one to show.
 */
export const parseEnabledHomeModes = (
  value: string | null | undefined
): ReadonlyArray<TerminalHomeMode> => {
  if (value === null || value === undefined) return terminalHomeModes

  try {
    const parsed = TerminalHomeModeSchema.array().safeParse(JSON.parse(value))
    if (!parsed.success) return terminalHomeModes

    const enabled = terminalHomeModes.filter((mode) =>
      parsed.data.includes(mode)
    )
    return enabled.length === 0 ? terminalHomeModes : enabled
  } catch {
    return terminalHomeModes
  }
}

/** The remembered mode while it is enabled, otherwise the first enabled one. */
export const resolveTerminalHomeMode = (
  remembered: TerminalHomeMode,
  enabled: ReadonlyArray<TerminalHomeMode>
): TerminalHomeMode =>
  enabled.includes(remembered) ? remembered : (enabled[0] ?? remembered)
