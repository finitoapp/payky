import { createIdFromString, sqliteTrue } from "@evolu/common"
import { z } from "zod"

import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import {
  type DefaultPaymentMethod,
  DefaultPaymentMethodSchema,
  type TerminalHomeMode,
  TerminalHomeModeSchema,
} from "@/core/modules/app-settings/app-settings-types.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { jsonCodec } from "@/zod-utils.ts"
import {
  defaultTipFixedAmounts,
  defaultTipPercentages,
  stringifyTipFixedAmounts,
  stringifyTipPercentages,
} from "./app-settings-tips.ts"

export const settingsId =
  createIdFromString<"AppSettings">("payky-app-settings")

export const defaultPaymentMethod: DefaultPaymentMethod = "spark"

/** The enum's own order is the order a new account starts with. */
export const defaultPaymentMethodOrder: ReadonlyArray<DefaultPaymentMethod> =
  DefaultPaymentMethodSchema.options

/** `paymentMethodOrderJson` as stored. */
export const PaymentMethodOrderJson = jsonCodec(
  DefaultPaymentMethodSchema.array().readonly()
)

/** `enabledHomeModesJson` as stored. */
export const EnabledHomeModesJson = jsonCodec(
  TerminalHomeModeSchema.array().readonly()
)

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
  paymentMethodOrderJson: z.encode(
    PaymentMethodOrderJson,
    defaultPaymentMethodOrder
  ),
  defaultPaymentMethod,
})

export const parsePaymentMethodOrder = (
  value: string | null | undefined
): ReadonlyArray<DefaultPaymentMethod> => {
  if (value === null || value === undefined) {
    return defaultPaymentMethodOrder
  }

  const parsed = z.safeDecode(PaymentMethodOrderJson, value)
  if (!parsed.success) return defaultPaymentMethodOrder

  const uniqueMethods = parsed.data.filter(
    (method, index, methods) => methods.indexOf(method) === index
  )
  const missingMethods = defaultPaymentMethodOrder.filter(
    (method) => !uniqueMethods.includes(method)
  )

  return [...uniqueMethods, ...missingMethods]
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

  const parsed = z.safeDecode(EnabledHomeModesJson, value)
  if (!parsed.success) return terminalHomeModes

  const enabled = terminalHomeModes.filter((mode) => parsed.data.includes(mode))
  return enabled.length === 0 ? terminalHomeModes : enabled
}

/** The remembered mode while it is enabled, otherwise the first enabled one. */
export const resolveTerminalHomeMode = (
  remembered: TerminalHomeMode,
  enabled: ReadonlyArray<TerminalHomeMode>
): TerminalHomeMode =>
  enabled.includes(remembered) ? remembered : (enabled[0] ?? remembered)
