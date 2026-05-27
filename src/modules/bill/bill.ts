import { BillId } from "@/modules/bill/bill-types.ts"
import { DeviceId } from "@/modules/device/device-types.ts"
import {
  BillStatusSchema,
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  PositiveIntegerSchema,
  TimestampMsSchema,
} from "@/modules/shared/schema.ts"
import { TableId } from "@/modules/table/table-types.ts"

export const bill = {
  id: BillId,
  deviceId: DeviceId.nullable(),
  displayNumber: PositiveIntegerSchema,
  label: NonEmptyString255Schema.nullable(),
  tableId: TableId.nullable(),
  status: BillStatusSchema,
  currency: FiatCurrencySchema,
  closedAt: TimestampMsSchema.nullable(),
  canceledAt: TimestampMsSchema.nullable(),
} as const

export type BillRow = InferTable<typeof bill>
