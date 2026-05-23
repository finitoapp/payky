import { useAtomValue } from "jotai"
import * as React from "react"
import { deviceEvoluAtom } from "@/atoms/device-evolu"
import { deviceSettingsId } from "@/core/evolu/device-client.ts"
import { useDeviceSettings } from "@/hooks/use-device-settings.ts"
import {
  type Language,
  resources,
  type TranslationKey,
} from "@/i18n/resources.ts"

export function useTranslation() {
  const { language } = useDeviceSettings()

  return React.useMemo(
    () => ({
      language,
      t: (key: TranslationKey) => resources[language][key],
    }),
    [language]
  )
}

export function useTranslationForLanguage() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return React.useCallback(
    (nextLanguage: Language) => {
      deviceEvolu.update("deviceSettings", {
        id: deviceSettingsId,
        language: nextLanguage,
      })
    },
    [deviceEvolu]
  )
}
