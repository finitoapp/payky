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

  test("survives a fractional quantity whose division does not land on an integer", () => {
    // `bin/cli-bills.ts add-item --quantity 0.7` is accepted
    // (`PositiveNumberFromStringSchema`), and `addCatalogItemToBill` takes a
    // `PositiveNumber` too, so a line of 0.7 x 2000 is a real row: its total
    // of 1400 is a clean integer. Dividing back is not — `1400 / 0.7` is
    // `2000.0000000000002` in IEEE 754 — and this used to decode that
    // straight through `NonNegativeInteger`, throwing while the operator
    // simply tapped "remove" on that line in the cart.
    expect(
      getBillLineSummaryUnitAmount(
        summary({
          id: "fractional",
          catalogItemId: "catalog-item-1",
          quantity: 0.7,
          totalAmount: 1_400,
        })
      )
    ).toBe(2_000)
  })

  test("rounds to the nearest minor unit when a total genuinely does not divide", () => {
    // Not reachable from any current writer — every line's total is
    // `unitAmount x quantity` — but money has no fractional minor unit, so
    // the nearest one is the only answer available.
    expect(
      getBillLineSummaryUnitAmount(
        summary({
          id: "indivisible",
          catalogItemId: "catalog-item-1",
          quantity: 3,
          totalAmount: 100,
        })
      )
    ).toBe(33)
  })
})
