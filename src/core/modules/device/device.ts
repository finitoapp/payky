import type { IndexesConfig } from "@evolu/common/local-first"

import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
} from "@/core/modules/shared/schema.ts"

export const device = {
  id: DeviceId,
  name: NonEmptyString255Schema,
  deviceType: NonEmptyString255Schema.nullable(),
  browserName: NonEmptyString255Schema.nullable(),
  osName: NonEmptyString255Schema.nullable(),
} as const

export const deviceIndexes = ((create) => [
  create("device_name").on("device").column("name"),
]) satisfies IndexesConfig

export type DeviceRow = InferTable<typeof device>
