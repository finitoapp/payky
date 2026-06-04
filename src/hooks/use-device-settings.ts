import * as React from "react"
import {
  createDefaultDeviceSettings,
  createDeviceQuery,
  type DeviceLanguage,
  type DeviceSettings,
  type DeviceSettingsRow,
  deviceSettingsId,
  getDeviceLocaleForLanguage,
} from "@/core/evolu/device-client.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"

function getPreferredDeviceLanguage(): DeviceLanguage {
  if (navigator.language.startsWith("cs")) {
    return "cs"
  }

  return "en"
}

export function getDefaultDeviceSettings(): DeviceSettings {
  return createDefaultDeviceSettings(getPreferredDeviceLanguage())
}

const deviceSettingsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "language", "theme", "locale"])
    .where("id", "=", deviceSettingsId)
)

function withDeviceSettingsDefaults(
  row: DeviceSettingsRow | undefined
): DeviceSettings {
  const defaults = getDefaultDeviceSettings()
  const language = row?.language ?? defaults.language

  return {
    id: row?.id ?? defaults.id,
    language,
    theme: row?.theme ?? defaults.theme,
    locale: row?.locale ?? getDeviceLocaleForLanguage(language),
  }
}

export function useDeviceSettings(): DeviceSettings {
  const { data } = useDeviceEvoluQuery(deviceSettingsQuery)
  const deviceSettings = data[0]

  return React.useMemo(
    () => withDeviceSettingsDefaults(deviceSettings),
    [deviceSettings]
  )
}
