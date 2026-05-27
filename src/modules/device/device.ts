import { DeviceId } from "@/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
} from "@/modules/shared/schema.ts"

export const device = {
  id: DeviceId,
  name: NonEmptyString255Schema,
  deviceType: NonEmptyString255Schema.nullable(),
  browserName: NonEmptyString255Schema.nullable(),
  osName: NonEmptyString255Schema.nullable(),
} as const

export type DeviceRow = InferTable<typeof device>
