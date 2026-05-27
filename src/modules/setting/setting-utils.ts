import { SqliteBoolean } from "@evolu/common"

import type { AppSettingsRow } from "@/modules/app-settings/app-settings.ts"
import type { AppSettingsId } from "@/modules/app-settings/app-settings-types.ts"

export const settingsId = "payky-app-settings" as AppSettingsId

export const createDefaultSettings = (): AppSettingsRow => ({
  id: settingsId,
  fiatCurrency: "CZK",
  tipsEnabled: SqliteBoolean.orThrow(1),
  presetTipPercentagesJson: JSON.stringify([5, 10, 15]),
  presetTipFixedAmountsJson: JSON.stringify([2000, 5000]),
  paymentMethodOrderJson: JSON.stringify(["cashRegister", "spark", "iban"]),
  bankIban: null,
  language: "en",
  theme: "system",
})
