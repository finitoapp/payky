import { createContext, useContext } from "react"

import type { Language, TranslationKey } from "@/i18n/resources.ts"

/**
 * The landing page translates straight from `resources` in the language of
 * its address (landing/0002), kept apart from the device setting: a visitor
 * comparing the page in two languages must not switch the app a merchant
 * has set up on the same device. This context carries it to the sections;
 * `setLanguage` moves to that language's page.
 */
export interface LandingTranslation {
  readonly language: Language
  readonly setLanguage: (language: Language) => void
  readonly t: (key: TranslationKey) => string
}

export const LandingTranslationContext =
  createContext<LandingTranslation | null>(null)

export function useLandingTranslation(): LandingTranslation {
  const translation = useContext(LandingTranslationContext)
  if (translation === null) {
    throw new Error(
      "useLandingTranslation must be used within LandingTranslationContext"
    )
  }
  return translation
}
