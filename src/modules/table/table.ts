import { DeviceId } from "@/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/modules/shared/schema.ts"
import { TableId } from "@/modules/table/table-types.ts"

export const table = {
  id: TableId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  sortOrder: NonNegativeIntegerSchema,
} as const

export type TableRow = InferTable<typeof table>
