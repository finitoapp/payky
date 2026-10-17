import { createTranslate } from "@payky/app-shared/i18n/translate"
import {
  createDeviceQuery,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import { useMemo } from "react"
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
