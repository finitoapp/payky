import { sqliteFalse, sqliteTrue } from "@evolu/common"
import * as React from "react"
import {
  useDeviceSettings,
  useUpdateDeviceSettings,
} from "@/hooks/use-device-settings.ts"

export function useErrorReportingEnabled(): boolean {
  return useDeviceSettings().errorReportingEnabled === sqliteTrue
}

export function useSetErrorReportingEnabled() {
  const updateDeviceSettings = useUpdateDeviceSettings()

  return React.useCallback(
    (enabled: boolean) => {
      updateDeviceSettings({
        errorReportingEnabled: enabled ? sqliteTrue : sqliteFalse,
      })
    },
    [updateDeviceSettings]
  )
}
