import type { Language } from "@payky/app-shared/i18n/resources"
import { createTranslate } from "@payky/app-shared/i18n/translate"
import {
  createDeviceQuery,
  deviceSettingsId,
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
      deviceEvolu.update("deviceSettings", { id: deviceSettingsId, language })
    },
    [deviceEvolu]
  )
}
