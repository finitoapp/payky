import type { Language } from "@payky/app-shared/i18n/resources"
import { createTranslate } from "@payky/app-shared/i18n/translate"
import { updateDeviceSettings } from "@payky/core/evolu/device-account"
import {
  createDeviceQuery,
  type DeviceLocale,
  deviceSettingsId,
  getDeviceLocaleForLanguage,
} from "@payky/core/evolu/device-client"
import { useAtomValue } from "jotai"
import { useCallback, useMemo } from "react"
import { deviceEvoluAtom } from "../atoms/device-evolu.ts"
import { useDeviceEvoluQuery } from "./use-evolu-query.ts"

const languageQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "language"])
    .where("id", "=", deviceSettingsId)
)

const localeQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "language", "locale"])
    .where("id", "=", deviceSettingsId)
)

/** Number and money formatting locale; falls back to the language's, as web's `useLocale`. */
export function useLocale(): DeviceLocale {
  const row = useDeviceEvoluQuery(localeQuery).data[0]
  return row?.locale ?? getDeviceLocaleForLanguage(row?.language ?? "en")
}

/** The device language comes from the bootstrapped device settings row. */
export function useTranslation() {
  const language = useDeviceEvoluQuery(languageQuery).data[0]?.language ?? "en"

  return useMemo(() => ({ language, t: createTranslate(language) }), [language])
}

/** Writes the device language (unsynced), as web's `useSetLanguage` does. */
export function useSetLanguage() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return useCallback(
    (language: Language) => {
      updateDeviceSettings(deviceEvolu, { language })
    },
    [deviceEvolu]
  )
}

/** Writes the device locale (number and money formatting), as web's `useSetLocale`. */
export function useSetLocale() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return useCallback(
    (locale: DeviceLocale) => {
      updateDeviceSettings(deviceEvolu, { locale })
    },
    [deviceEvolu]
  )
}
