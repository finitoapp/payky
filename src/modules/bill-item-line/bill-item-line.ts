import { BillId } from "@/modules/bill/bill-types.ts"
import { BillItemLineId } from "@/modules/bill-item-line/bill-item-line-types.ts"
import { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"
import { DeviceId } from "@/modules/device/device-types.ts"
import { ItemId } from "@/modules/item/item-types.ts"
import {
  BillItemLineTagSchema,
  BillItemTypeSchema,
  type InferTable,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/modules/shared/schema.ts"

export const billItemLine = {
  id: BillItemLineId,
  billId: BillId,
  deviceId: DeviceId.nullable(),
  catalogItemId: CatalogItemId.nullable(),
  itemId: ItemId,
  type: BillItemTypeSchema,
  kind: BillItemLineTagSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
} as const

export type BillItemLineRow = InferTable<typeof billItemLine>
