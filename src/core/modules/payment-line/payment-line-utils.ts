import { createIdFromString } from "@evolu/common"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { createBillLineSummaryId } from "@/core/modules/bill-line/bill-line-utils.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type {
  ItemLineType,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { PaymentLineId } from "./payment-line-types.ts"

/**
 * Turns a payment's frozen `paymentLine` rows into `BillLineSummary`-shaped
 * values by joining in the (immutable) `item` snapshot each references for
 * its name/description/currency — the same shape `calculateBillLineSummaries`
 * produces for the bill's *current* lines, so both sides of a comparison
 * line up. Unlike `calculateBillLineSummaries`, there is no add/remove to
 * net here: each `paymentLine` row already *is* one net line, frozen at
 * write time (see `snapshotBillLinesForPayment`).
 *
 * Takes the shape `paymentLinesByPaymentIdQuery`'s `$narrowType` produces
 * (every field but `catalogItemId` guaranteed non-null), not the raw
 * `PaymentLineRow` — that query is the only realistic source for this.
 */
export const paymentLinesToBillLineSummaries = (
  paymentLineRows: ReadonlyArray<{
    readonly billId: BillId
    readonly catalogItemId: CatalogItemId | null
    readonly itemId: ItemId
    readonly type: ItemLineType
    readonly quantity: PositiveNumber
    readonly totalAmount: NonNegativeInteger
  }>,
  itemRows: ReadonlyArray<ItemRow>
) => {
  const itemsById = new Map(itemRows.map((item) => [item.id, item]))

  return paymentLineRows.flatMap((line) => {
    const item = itemsById.get(line.itemId)
    if (item === undefined) return []

    return [
      {
        id: createBillLineSummaryId({
          billId: line.billId,
          catalogItemId: line.catalogItemId,
          itemId: line.itemId,
          type: line.type,
        }),
        billId: line.billId,
        catalogItemId: line.catalogItemId,
        itemId: line.itemId,
        type: line.type,
        name: item.name,
        description: item.description,
        currency: item.currency,
        quantity: line.quantity,
        totalAmount: line.totalAmount,
        taxRateId: item.taxRateId,
      },
    ]
  })
}

interface PaymentLineIdentityInput {
  readonly paymentId: PaymentId
  readonly catalogItemId: CatalogItemId | null
  readonly itemId: ItemId
  readonly type: ItemLineType
}

/**
 * Deterministic, not random — re-snapshotting the same payment (e.g. a
 * retried write) reproduces the same row ids instead of duplicating lines.
 */
export const createPaymentLineId = (
  input: PaymentLineIdentityInput
): PaymentLineId =>
  createIdFromString<"PaymentLine">(
    JSON.stringify({
      paymentId: input.paymentId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )
