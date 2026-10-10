import type { TerminalHomeMode } from "@/core/modules/app-settings/app-settings-types.ts"
import type { CountryCode } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/** The home screen's two modes, as the toggle and the settings name them. */
export const homeModeLabelKeys = {
  numpad: "nav.numpad",
  pos: "nav.pos",
} satisfies Record<TerminalHomeMode, TranslationKey>

const countryLabelKeys = {
  CZ: "country.cz",
  SK: "country.sk",
} satisfies Record<CountryCode, TranslationKey>

/** A legal entity's country, `null` (not set) reading as "Other". */
export const countryLabelKey = (country: CountryCode | null): TranslationKey =>
  country === null ? "country.other" : countryLabelKeys[country]
