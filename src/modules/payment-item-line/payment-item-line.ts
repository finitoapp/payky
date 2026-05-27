import { BillId } from "@/modules/bill/bill-types.ts"
import { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/modules/item/item-types.ts"
import { PaymentId } from "@/modules/payment/payment-types.ts"
import { PaymentItemLineId } from "@/modules/payment-item-line/payment-item-line-types.ts"
import {
  BillItemTypeSchema,
  type InferTable,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/modules/shared/schema.ts"

export const paymentItemLine = {
  id: PaymentItemLineId,
  paymentId: PaymentId,
  billId: BillId.nullable(),
  catalogItemId: CatalogItemId.nullable(),
  itemId: ItemId,
  type: BillItemTypeSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
} as const

export type PaymentItemLineRow = InferTable<typeof paymentItemLine>
