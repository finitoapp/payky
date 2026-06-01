import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"

export const settingsId =
  createIdFromString<"AppSettings">("payky-app-settings")

export const createDefaultSettings = (): AppSettingsRow => ({
  id: settingsId,
  fiatCurrency: FiatCurrency.CZK,
  tipsEnabled: sqliteTrue,
  presetTipPercentagesJson: JSON.stringify([5, 10, 15]),
  presetTipFixedAmountsJson: JSON.stringify([2000, 5000]),
  paymentMethodOrderJson: JSON.stringify(["cashRegister", "spark", "iban"]),
  bankIban: null,
  language: "en",
  theme: "system",
})
