import * as React from "react"
import type { DeviceLocale } from "@/core/evolu/device-client.ts"
import {
  useDeviceSettings,
  useUpdateDeviceSettings,
} from "@/hooks/use-device-settings.ts"

export function useLocale(): DeviceLocale {
  return useDeviceSettings().locale
}

export function useSetLocale() {
  const updateDeviceSettings = useUpdateDeviceSettings()

  return React.useCallback(
    (nextLocale: DeviceLocale) => {
      updateDeviceSettings({ locale: nextLocale })
    },
    [updateDeviceSettings]
  )
}
