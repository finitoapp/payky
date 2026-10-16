import {
  type TranslationKey as LandingTranslationKey,
  resources as landingResources,
} from "../../../landing/src/i18n/resources.ts"
import {
  type TranslationKey as AppTranslationKey,
  resources as appResources,
  type Language,
} from "../../src/i18n/resources.ts"

type TranslationKey = AppTranslationKey | LandingTranslationKey
const resources = {
  en: { ...appResources.en, ...landingResources.en },
  cs: { ...appResources.cs, ...landingResources.cs },
  sk: { ...appResources.sk, ...landingResources.sk },
}

/**
 * Runner-agnostic: `bin/generate-doc-screenshots.ts` imports these helpers
 * outside the Playwright test runner, so nothing here may call `test.step(...)`
 * — it throws "test.step() can only be called from a test" there.
 */
export function translate(language: Language, key: TranslationKey): string {
  return resources[language][key]
}

/** `translate()` for a `{name}`-templated key, e.g. `"bill.brick.add.aria"`. Always English — every current call site only ever needs it in the default test language. */
export function nameParam(key: TranslationKey, name: string): string {
  return translate("en", key).replace("{name}", name)
}

/** `translate()` for a `{value}`-templated key, e.g. `"settings.tips.percentages.value"` ("{value}%"). */
export function translateValue(
  language: Language,
  key: TranslationKey,
  value: string | number
): string {
  return translate(language, key).replace("{value}", String(value))
}
