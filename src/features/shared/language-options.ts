import type { Language } from "@/i18n/resources.ts"

export interface LanguageOption {
  readonly value: Language
  /** Language names are intentionally shown in their own language. */
  readonly label: string
}

export const languageOptions: ReadonlyArray<LanguageOption> = [
  {
    value: "en",
    label: "English",
  },
  {
    value: "cs",
    label: "Čeština",
  },
  {
    value: "sk",
    label: "Slovenčina",
  },
]
