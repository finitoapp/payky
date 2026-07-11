import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { useAtomValue } from "jotai"
import * as React from "react"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { deviceSettingsId } from "@/core/evolu/device-client.ts"
import { useDeviceSettings } from "@/hooks/use-device-settings.ts"

export function useErrorReportingEnabled(): boolean {
  return useDeviceSettings().errorReportingEnabled === sqliteTrue
}

export function useSetErrorReportingEnabled() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return React.useCallback(
    (enabled: boolean) => {
      deviceEvolu.update("deviceSettings", {
        id: deviceSettingsId,
        errorReportingEnabled: enabled ? sqliteTrue : sqliteFalse,
      })
    },
    [deviceEvolu]
  )
}
