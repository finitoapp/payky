import type { Language, TranslationKey } from "@/i18n/resources.ts"

export interface LanguageOption {
  readonly value: Language
  /** Language names are intentionally shown in their own language. */
  readonly label: string
  readonly description: TranslationKey
}

export const languageOptions: ReadonlyArray<LanguageOption> = [
  {
    value: "en",
    label: "English",
    description: "settings.language.english.description",
  },
  {
    value: "cs",
    label: "Čeština",
    description: "settings.language.czech.description",
  },
  {
    value: "sk",
    label: "Slovenčina",
    description: "settings.language.slovak.description",
  },
]
