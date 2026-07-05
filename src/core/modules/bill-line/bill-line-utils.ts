import { createIdFromString } from "@evolu/common"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import {
  type ItemLineType,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { BillLineRow } from "./bill-line.ts"
import type { BillLineSummary } from "./bill-line-summary.ts"

interface BillLineSummaryIdentityInput {
  readonly billId: BillId
  readonly catalogItemId: BillLineSummary["catalogItemId"]
  readonly itemId: BillLineSummary["itemId"]
  readonly type: ItemLineType
}

export const createBillLineSummaryId = (
  input: BillLineSummaryIdentityInput
): string =>
  createIdFromString<"BillLineSummary">(
    JSON.stringify({
      billId: input.billId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )

export const calculateBillLineSummaries = (
  lineRows: ReadonlyArray<BillLineRow>,
  itemRows: ReadonlyArray<ItemRow>
): ReadonlyArray<BillLineSummary> => {
  const itemsById = new Map(itemRows.map((item) => [item.id, item]))
  const projected = new Map<string, BillLineSummary>()

  for (const line of lineRows) {
    const item = itemsById.get(line.itemId)
    if (item === undefined) {
      continue
    }

    const idValue = createBillLineSummaryId({
      billId: line.billId,
      catalogItemId: line.catalogItemId,
      itemId: line.itemId,
      type: line.type,
    })
    const existing = projected.get(idValue)
    const direction = line.kind === "add" ? 1 : -1
    const nextQuantity = (existing?.quantity ?? 0) + direction * line.quantity
    const nextTotalAmount =
      (existing?.totalAmount ?? 0) + direction * line.totalAmount

    if (nextQuantity <= 0) {
      projected.delete(idValue)
      continue
    }

    projected.set(idValue, {
      id: idValue,
      billId: line.billId,
      catalogItemId: line.catalogItemId,
      itemId: line.itemId,
      type: line.type,
      name: item.name,
      description: item.description,
      currency: item.currency,
      quantity: PositiveNumber(nextQuantity),
      totalAmount: NonNegativeInteger(Math.max(0, nextTotalAmount)),
    })
  }

  return [...projected.values()]
}
