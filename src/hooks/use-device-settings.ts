import * as React from "react"
import {
  createDefaultDeviceSettings,
  createDeviceQuery,
  type DeviceSettings,
  type DeviceSettingsRow,
  deviceSettingsId,
  getDeviceLocaleForLanguage,
} from "@/core/evolu/device-client.ts"
import { getPreferredDeviceLanguage } from "@/core/modules/device/device-utils.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"

export function getDefaultDeviceSettings(): DeviceSettings {
  return createDefaultDeviceSettings(
    getPreferredDeviceLanguage(navigator.language)
  )
}

const deviceSettingsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "language", "theme", "locale", "errorReportingEnabled"])
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
    errorReportingEnabled:
      row?.errorReportingEnabled ?? defaults.errorReportingEnabled,
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
