import * as React from "react"
import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"

interface TranslationProviderProps {
  readonly children: React.ReactNode
  readonly defaultLanguage?: Language
  readonly storageKey?: string
}

interface TranslationProviderState {
  readonly language: Language
  readonly setLanguage: (language: Language) => void
  readonly t: (key: TranslationKey) => string
}

const fallbackLanguage = "en" satisfies Language
const languageValues = Object.keys(resources) as ReadonlyArray<Language>
const TranslationProviderContext = React.createContext<
  TranslationProviderState | undefined
>(undefined)

function isLanguage(value: string | null): value is Language {
  if (value === null) {
    return false
  }

  return languageValues.includes(value as Language)
}

function getPreferredLanguage(): Language {
  if (navigator.language.startsWith("cs")) {
    return "cs"
  }

  return fallbackLanguage
}

export function TranslationProvider({
  children,
  defaultLanguage = getPreferredLanguage(),
  storageKey = "language",
}: TranslationProviderProps) {
  const [language, setLanguageState] = React.useState<Language>(() => {
    const storedLanguage = localStorage.getItem(storageKey)
    if (isLanguage(storedLanguage)) {
      return storedLanguage
    }

    return defaultLanguage
  })

  const setLanguage = React.useCallback(
    (nextLanguage: Language) => {
      localStorage.setItem(storageKey, nextLanguage)
      setLanguageState(nextLanguage)
    },
    [storageKey]
  )

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return
      }

      if (event.key !== storageKey) {
        return
      }

      if (isLanguage(event.newValue)) {
        setLanguageState(event.newValue)
        return
      }

      setLanguageState(defaultLanguage)
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultLanguage, storageKey])

  const value = React.useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey) => resources[language][key],
    }),
    [language, setLanguage]
  )

  return React.createElement(
    TranslationProviderContext.Provider,
    { value },
    children
  )
}

export function useTranslation() {
  const context = React.useContext(TranslationProviderContext)

  if (context === undefined) {
    throw new Error("useTranslation must be used within a TranslationProvider")
  }

  return context
}
