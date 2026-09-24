import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface FiatCurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
}

const fiatCurrencyOptionCopy = {
  [FiatCurrency.EUR]: {
    label: "settings.fiat.eur.title",
  },
  [FiatCurrency.USD]: {
    label: "settings.fiat.usd.title",
  },
  [FiatCurrency.CZK]: {
    label: "settings.fiat.czk.title",
  },
} satisfies Record<FiatCurrencyType, Omit<FiatCurrencyOption, "value">>

export const fiatCurrencyOptions: ReadonlyArray<FiatCurrencyOption> = (
  Object.keys(fiatCurrencyOptionCopy) as ReadonlyArray<FiatCurrencyType>
).map((value) => ({ value, ...fiatCurrencyOptionCopy[value] }))
