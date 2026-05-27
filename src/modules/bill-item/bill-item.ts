import { BillId } from "@/modules/bill/bill-types.ts"
import { BillItemId } from "@/modules/bill-item/bill-item-types.ts"
import { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/modules/item/item-types.ts"
import {
  BillItemTypeSchema,
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/modules/shared/schema.ts"

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

export type BillItemRow = InferTable<typeof billItem>
