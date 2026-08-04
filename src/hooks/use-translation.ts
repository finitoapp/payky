import * as React from "react"
import {
  useDeviceSettings,
  useUpdateDeviceSettings,
} from "@/hooks/use-device-settings.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"

function interpolate(
  text: string,
  params: Readonly<Record<string, string | number>>
): string {
  return Object.entries(params).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text
  )
}

export function useTranslation() {
  const { language } = useDeviceSettings()

  return React.useMemo(
    () => ({
      language,
      t: (
        key: TranslationKey,
        params?: Readonly<Record<string, string | number>>
      ): string => {
        const text = resources[language][key]
        return params === undefined ? text : interpolate(text, params)
      },
    }),
    [language]
  )
}

export function useSetLanguage() {
  const updateDeviceSettings = useUpdateDeviceSettings()

  return React.useCallback(
    (nextLanguage: Language) => {
      updateDeviceSettings({ language: nextLanguage })
    },
    [updateDeviceSettings]
  )
}
