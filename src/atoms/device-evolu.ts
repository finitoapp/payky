import { atom } from "jotai"
import { createDeviceEvolu } from "@/core/evolu/device-client.ts"

export const deviceEvoluAtom = atom(async () => {
  const deviceEvolu = await createDeviceEvolu()

  return deviceEvolu
})
