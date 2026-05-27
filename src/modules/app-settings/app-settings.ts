import { SqliteBoolean } from "@evolu/common"
import { z } from "zod"

import { AppSettingsId } from "@/modules/app-settings/app-settings-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
} from "@/modules/shared/schema.ts"

export const appSettings = {
  id: AppSettingsId,
  fiatCurrency: FiatCurrencySchema,
  tipsEnabled: SqliteBoolean,
  presetTipPercentagesJson: z.string(),
  presetTipFixedAmountsJson: z.string(),
  paymentMethodOrderJson: z.string(),
  bankIban: NonEmptyString255Schema.nullable(),
  language: z.enum(["en", "cs"]),
  theme: z.enum(["system", "light", "dark"]),
} as const

export type AppSettingsRow = InferTable<typeof appSettings>
