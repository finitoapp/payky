import { createContext, useContext } from "react"
import { z } from "zod"

import type { Language, TranslationKey } from "@/i18n/resources.ts"

/**
 * The landing page translates straight from `resources` with a language of
 * its own, kept apart from the device setting: a visitor comparing the page
 * in two languages must not switch the app a merchant has set up on the
 * same device. This context carries that choice to the page's sections.
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

export const landingLanguageStorageKey = "payky.landingLanguage"

export const LandingLanguageSchema: z.ZodType<Language> = z.enum([
  "cs",
  "en",
  "sk",
])
