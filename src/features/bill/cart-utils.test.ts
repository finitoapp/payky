import { describe, expect, test } from "vitest"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  getBillLineSummaryUnitAmount,
  getLatestCatalogItemSummary,
} from "./cart-utils.ts"

const summary = (input: {
  readonly id: string
  readonly catalogItemId: string
  readonly quantity: number
  readonly totalAmount: number
}): BillLineSummary => ({
  id: input.id as BillLineSummary["id"],
  billId: "bill-1" as BillLineSummary["billId"],
  catalogItemId: input.catalogItemId as NonNullable<
    BillLineSummary["catalogItemId"]
  >,
  itemId: `item-${input.id}` as BillLineSummary["itemId"],
  type: "catalogItem",
  name: NonEmptyString255("Coffee"),
  description: null,
  currency: "USD",
  quantity: PositiveNumber(input.quantity),
  totalAmount: NonNegativeInteger(input.totalAmount),
  taxRateId: null,
})

describe("cart utilities", () => {
  test("decrements the latest persisted snapshot after a catalog item changes", () => {
    const oldSnapshot = summary({
      id: "old",
      catalogItemId: "catalog-item-1",
      quantity: 1,
      totalAmount: 500,
    })
    const newSnapshot = summary({
      id: "new",
      catalogItemId: "catalog-item-1",
      quantity: 2,
      totalAmount: 1_200,
    })

    const selected = getLatestCatalogItemSummary(
      [oldSnapshot, newSnapshot],
      "catalog-item-1" as NonNullable<BillLineSummary["catalogItemId"]>
    )

    expect(selected).toBe(newSnapshot)
    expect(getBillLineSummaryUnitAmount(newSnapshot)).toBe(600)
  })
})
