import type { IndexesConfig } from "@evolu/common/local-first"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { BillLineId } from "@/core/modules/bill-line/bill-line-types.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import {
  BillLineTagSchema,
  type InferTable,
  ItemLineTypeSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/core/modules/shared/schema.ts"

export const billLine = {
  id: BillLineId,
  billId: BillId,
  deviceId: DeviceId.nullable(),
  catalogItemId: CatalogItemId.nullable(),
  itemId: ItemId,
  type: ItemLineTypeSchema,
  kind: BillLineTagSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
} as const

export const billLineIndexes = ((create) => [
  create("billLine_billId_createdAt")
    .on("billLine")
    .columns(["billId", "createdAt"]),
  create("billLine_itemId").on("billLine").column("itemId"),
]) satisfies IndexesConfig

export type BillLineRow = InferTable<typeof billLine>
