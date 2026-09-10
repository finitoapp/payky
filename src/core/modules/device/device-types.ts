import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const DeviceIdRaw = id("Device")
export const DeviceId = standardSchemaToZod(DeviceIdRaw)
export type DeviceId = typeof DeviceIdRaw.Output
