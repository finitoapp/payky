import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"

const fallbackLanguage = "en" satisfies Language

function getPreferredLanguage(): Language {
  if (navigator.language.startsWith("cs")) {
    return "cs"
  }

  return fallbackLanguage
}

export function useTranslation() {
  const language = getPreferredLanguage()

  return {
    language,
    t: (key: TranslationKey) => resources[language][key],
  } as const
}
