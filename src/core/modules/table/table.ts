import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import { TableId } from "@/core/modules/table/table-types.ts"

export const table = {
  id: TableId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  seatCount: PositiveIntegerSchema,
  // Not read or written by any feature yet — reserved for a future QR code
  // sticker on the physical table that resolves straight to it.
  code: NonEmptyString255Schema,
  sortOrder: NonNegativeIntegerSchema,
} as const

export type Table = typeof table
export type TableRow = InferTable<typeof table>
