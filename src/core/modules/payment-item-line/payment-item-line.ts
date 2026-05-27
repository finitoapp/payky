import type { IndexesConfig } from "@evolu/common/local-first"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { PaymentItemLineId } from "@/core/modules/payment-item-line/payment-item-line-types.ts"
import {
  BillItemTypeSchema,
  type InferTable,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/core/modules/shared/schema.ts"

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

export const paymentItemLineIndexes = ((create) => [
  create("paymentItemLine_paymentId").on("paymentItemLine").column("paymentId"),
]) satisfies IndexesConfig

export type PaymentItemLineRow = InferTable<typeof paymentItemLine>
