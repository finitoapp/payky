import type { Language } from "@payky/app-shared/i18n/resources"

/** Names stay in their own language; same list as web's `languageOptions`. */
export const languageOptions: ReadonlyArray<{
  readonly value: Language
  readonly label: string
}> = [
  { value: "en", label: "English" },
  { value: "cs", label: "Čeština" },
  { value: "sk", label: "Slovenčina" },
]
