import { SqliteBoolean, sqliteTrue } from "@evolu/common"
import { z } from "zod"

import { AppSettingsId } from "@/core/modules/app-settings/app-settings-types.ts"
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
} as const

export type AppSettingsRow = InferTable<typeof appSettings>
