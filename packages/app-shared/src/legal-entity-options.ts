import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { optionalIdCodec } from "@payky/app-shared/inline-edit-codecs"
import type { CountryCode } from "@payky/core/modules/legal-entity/legal-entity-types"

/**
 * The legal-entity screen's own choice, distinct from the persisted
 * `CountryCode | null`: "OTHER" stays explicit here so it can be told apart
 * from "not chosen yet", which is the row not existing at all.
 */
export const OTHER_COUNTRY = "OTHER"

export const countryOptions: ReadonlyArray<CountryCode | typeof OTHER_COUNTRY> =
  ["CZ", "SK", OTHER_COUNTRY]

export const countryCodec = optionalIdCodec<CountryCode>(OTHER_COUNTRY)

const countryLabelKeys = {
  CZ: "country.cz",
  SK: "country.sk",
} satisfies Record<CountryCode, TranslationKey>

/** A legal entity's country, `null` (not set) reading as "Other". */
export const countryLabelKey = (country: CountryCode | null): TranslationKey =>
  country === null ? "country.other" : countryLabelKeys[country]
