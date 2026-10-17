import {
  createDefaultDeviceSettings,
  createDeviceEvolu,
  createDeviceQuery,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import { getPreferredDeviceLanguage } from "@payky/core/modules/device/device-utils"
import { atom } from "jotai"
import { nativeRun } from "../core/native-runtime.ts"

const deviceSettingsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "language"])
    .where("id", "=", deviceSettingsId)
)

/** The device's UI language source: the OS locale, not `navigator.language`. */
const getNativeLocale = () => Intl.DateTimeFormat().resolvedOptions().locale

/** The one unsynced device database, opened once per Jotai store. */
export const deviceEvoluAtom = atom(async () => {
  const deviceEvolu = await nativeRun.ok(createDeviceEvolu)
  const deviceSettings = await deviceEvolu.loadQuery(deviceSettingsQuery)

  if (deviceSettings.length === 0) {
    deviceEvolu.upsert(
      "deviceSettings",
      createDefaultDeviceSettings(getPreferredDeviceLanguage(getNativeLocale()))
    )
  }

  return deviceEvolu
})

/** Read-only diagnostic: the stored device language, never other contents. */
export const deviceLanguageAtom = atom(async (get) => {
  const deviceEvolu = await get(deviceEvoluAtom)
  const [row] = await deviceEvolu.loadQuery(deviceSettingsQuery)
  return row?.language ?? null
})
