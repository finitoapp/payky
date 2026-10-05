import { SqliteBoolean, sqliteTrue } from "@evolu/common"
import { z } from "zod"

import {
  AppSettingsId,
  DefaultPaymentMethodSchema,
} from "@/core/modules/app-settings/app-settings-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
} from "@/core/modules/shared/schema.ts"

export const appSettings = {
  id: AppSettingsId,
  onboardingCompleted: z.literal(sqliteTrue).nullable(),
  fiatCurrency: FiatCurrencySchema,
  tipsEnabled: SqliteBoolean,
  presetTipPercentagesJson: z.string(),
  presetTipFixedAmountsJson: z.string(),
  paymentMethodOrderJson: z.string(),
  defaultPaymentMethod: DefaultPaymentMethodSchema,
  /**
   * The home-screen modes on offer, as a JSON array; `null` means all of
   * them. Nullable and left out of `settingsQuery`'s filter, so rows written
   * before the column existed still count as onboarded settings.
   */
  enabledHomeModesJson: z.string().nullable(),
} as const

export type AppSettingsRow = InferTable<typeof appSettings>
