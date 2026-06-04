import { useAtomValue } from "jotai"
import * as React from "react"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import type { DeviceLocale } from "@/core/evolu/device-client.ts"
import { deviceSettingsId } from "@/core/evolu/device-client.ts"
import { useDeviceSettings } from "@/hooks/use-device-settings.ts"

export function useLocale(): DeviceLocale {
  return useDeviceSettings().locale
}

export function useSetLocale() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return React.useCallback(
    (nextLocale: DeviceLocale) => {
      deviceEvolu.update("deviceSettings", {
        id: deviceSettingsId,
        locale: nextLocale,
      })
    },
    [deviceEvolu]
  )
}
