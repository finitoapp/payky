import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export interface FiatCurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const fiatCurrencyOptionCopy = {
  [FiatCurrency.EUR]: {
    label: "settings.fiat.eur.title",
    description: "settings.fiat.eur.description",
  },
  [FiatCurrency.USD]: {
    label: "settings.fiat.usd.title",
    description: "settings.fiat.usd.description",
  },
  [FiatCurrency.CZK]: {
    label: "settings.fiat.czk.title",
    description: "settings.fiat.czk.description",
  },
} satisfies Record<FiatCurrencyType, Omit<FiatCurrencyOption, "value">>

export const fiatCurrencyOptions: ReadonlyArray<FiatCurrencyOption> = (
  Object.keys(fiatCurrencyOptionCopy) as ReadonlyArray<FiatCurrencyType>
).map((value) => ({ value, ...fiatCurrencyOptionCopy[value] }))
