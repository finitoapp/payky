import type { IndexesConfig } from "@evolu/common/local-first"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { BillItemId } from "@/core/modules/bill-item/bill-item-types.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import {
  BillItemTypeSchema,
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/core/modules/shared/schema.ts"

export const billItem = {
  id: BillItemId,
  billId: BillId,
  catalogItemId: CatalogItemId.nullable(),
  itemId: ItemId,
  type: BillItemTypeSchema,
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
} as const

export const billItemIndexes = ((create) => [
  create("billItem_billId").on("billItem").column("billId"),
  create("billItem_itemId").on("billItem").column("itemId"),
]) satisfies IndexesConfig

export type BillItemRow = InferTable<typeof billItem>
