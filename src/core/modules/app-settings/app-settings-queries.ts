import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import { settingsId } from "./app-settings-utils.ts"

export const settingsQuery = createQuery((db) =>
  db
    .selectFrom("appSettings")
    .selectAll()
    .where("id", "=", settingsId)
    .where("fiatCurrency", "is not", null)
    .where("tipsEnabled", "is not", null)
    .where("presetTipPercentagesJson", "is not", null)
    .where("presetTipFixedAmountsJson", "is not", null)
    .where("paymentMethodOrderJson", "is not", null)
    .where("language", "is not", null)
    .where("theme", "is not", null)
    .$narrowType<{
      fiatCurrency: KyselyNotNull
      tipsEnabled: KyselyNotNull
      presetTipPercentagesJson: KyselyNotNull
      presetTipFixedAmountsJson: KyselyNotNull
      paymentMethodOrderJson: KyselyNotNull
      language: KyselyNotNull
      theme: KyselyNotNull
    }>()
)
