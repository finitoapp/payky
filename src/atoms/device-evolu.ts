import { atom } from "jotai"
import { runAtom } from "@/atoms/run.ts"
import {
  createDefaultDeviceSettings,
  createDeviceEvolu,
  createDeviceQuery,
  type DeviceLanguage,
  deviceSettingsId,
} from "@/core/evolu/device-client.ts"

function getPreferredDeviceLanguage(): DeviceLanguage {
  if (navigator.language.startsWith("cs")) {
    return "cs"
  }

  return "en"
}

const deviceSettingsQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select("id")
    .where("id", "=", deviceSettingsId)
)

export const deviceEvoluAtom = atom(async (get) => {
  const run = get(runAtom)
  const deviceEvolu = await run.orThrow(createDeviceEvolu)
  const deviceSettings = await deviceEvolu.loadQuery(deviceSettingsQuery)

  if (deviceSettings.length === 0) {
    deviceEvolu.upsert(
      "deviceSettings",
      createDefaultDeviceSettings(getPreferredDeviceLanguage())
    )
  }

  return deviceEvolu
})
