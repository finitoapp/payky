import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const DeviceIdRaw = id("Device")
export const DeviceId = standardSchemaToZod(DeviceIdRaw)
export type DeviceId = typeof DeviceIdRaw.Type
