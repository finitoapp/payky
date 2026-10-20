import { updateDeviceSettings } from "@payky/core/evolu/device-account"
import type { DeviceTheme } from "@payky/core/evolu/device-client"
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { deviceEvoluAtom, deviceSettingsQuery } from "../atoms/device-evolu.ts"
import { useDeviceEvoluQuery } from "./use-evolu-query.ts"

/** The device theme preference (unsynced); `system` until one is chosen, as web. */
export function useThemePreference(): DeviceTheme {
  return useDeviceEvoluQuery(deviceSettingsQuery).data[0]?.theme ?? "system"
}

/** Writes the device theme preference, as web's `useTheme().setTheme`. */
export function useSetThemePreference() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return useCallback(
    (theme: DeviceTheme) => updateDeviceSettings(deviceEvolu, { theme }),
    [deviceEvolu]
  )
}
