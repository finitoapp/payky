import { updateDeviceSettings } from "@payky/core/evolu/device-account"
import {
  createDeviceQuery,
  type DeviceTheme,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { deviceEvoluAtom } from "../atoms/device-evolu.ts"
import { useDeviceEvoluQuery } from "./use-evolu-query.ts"

const themeQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "theme"])
    .where("id", "=", deviceSettingsId)
)

/** The device theme preference (unsynced); `system` until one is chosen, as web. */
export function useThemePreference(): DeviceTheme {
  return useDeviceEvoluQuery(themeQuery).data[0]?.theme ?? "system"
}

/** Writes the device theme preference, as web's `useTheme().setTheme`. */
export function useSetThemePreference() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return useCallback(
    (theme: DeviceTheme) => updateDeviceSettings(deviceEvolu, { theme }),
    [deviceEvolu]
  )
}
