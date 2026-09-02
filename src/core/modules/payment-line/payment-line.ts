import type { IndexesConfig } from "@evolu/common/local-first"

import { BillId } from "@/core/modules/bill/bill-types.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import {
  type InferTable,
  ItemLineTypeSchema,
  NonNegativeIntegerSchema,
  PositiveNumberSchema,
} from "@/core/modules/shared/schema.ts"

/**
 * A frozen snapshot of one net bill-line at the moment a payment was
 * created — written once, by `snapshotBillLinesForPayment`
 * (`payment-line-actions.ts`), from `createPayment`, and never updated
 * afterward. Lets the payment detail page show *what* changed on the bill
 * since this payment was made (see `deriveBillLineSummaryDiff` in
 * `bill-line-utils.ts`), not just that the amounts no longer match. See
 * docs/bill-payment-states.md's "Bill payment coverage" section.
 */
export const paymentLine = {
  id: PaymentLineId,
  paymentId: PaymentId,
  billId: BillId.nullable(),
  catalogItemId: CatalogItemId.nullable(),
  itemId: ItemId,
  type: ItemLineTypeSchema,
  quantity: PositiveNumberSchema,
  totalAmount: NonNegativeIntegerSchema,
} as const

export const paymentLineIndexes = ((create) => [
  create("paymentLine_paymentId").on("paymentLine").column("paymentId"),
]) satisfies IndexesConfig

export type PaymentLineRow = InferTable<typeof paymentLine>
