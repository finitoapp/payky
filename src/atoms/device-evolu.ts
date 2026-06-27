import { atom } from "jotai"
import { runAtom } from "@/atoms/run.ts"
import {
  createDefaultDeviceSettings,
  createDeviceEvolu,
  createDeviceQuery,
  deviceSettingsId,
} from "@/core/evolu/device-client.ts"
import { getPreferredDeviceLanguage } from "@/core/modules/device/device-utils.ts"

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
      createDefaultDeviceSettings(
        getPreferredDeviceLanguage(navigator.language)
      )
    )
  }

  return deviceEvolu
})
