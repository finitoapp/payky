import { describe, expect, test } from "vitest"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { BillLineRow } from "./bill-line.ts"
import type { BillLineId } from "./bill-line-types.ts"
import {
  calculateBillLineSummaries,
  createBillLineSummaryId,
} from "./bill-line-utils.ts"

describe("bill line summaries", () => {
  test("calculates summaries from bill lines without persistence", () => {
    const item: ItemRow = {
      id: "item-1" as ItemId,
      catalogItemId: "catalog-1" as CatalogItemId,
      name: NonEmptyString255("Coffee"),
      description: null,
      currency: "CZK",
      unitAmount: NonNegativeInteger(5900),
    }
    const lines: ReadonlyArray<BillLineRow> = [
      {
        id: "line-1" as BillLineId,
        billId: "bill-1" as BillId,
        deviceId: null,
        catalogItemId: "catalog-1" as CatalogItemId,
        itemId: item.id,
        type: "catalogItem",
        kind: "add",
        quantity: PositiveNumber(2),
        totalAmount: NonNegativeInteger(11800),
      },
      {
        id: "line-2" as BillLineId,
        billId: "bill-1" as BillId,
        deviceId: null,
        catalogItemId: "catalog-1" as CatalogItemId,
        itemId: item.id,
        type: "catalogItem",
        kind: "remove",
        quantity: PositiveNumber(1),
        totalAmount: NonNegativeInteger(5900),
      },
    ]

    expect(calculateBillLineSummaries(lines, [item])).toMatchObject([
      {
        billId: "bill-1",
        catalogItemId: "catalog-1",
        itemId: "item-1",
        type: "catalogItem",
        name: "Coffee",
        quantity: 1,
        totalAmount: 5900,
      },
    ])
  })

  test("creates stable summary ids from projection identity", () => {
    const identity = {
      billId: "bill-1" as BillId,
      catalogItemId: "catalog-1" as CatalogItemId,
      itemId: "item-1" as ItemId,
      type: "catalogItem" as const,
    }

    expect(createBillLineSummaryId(identity)).toBe(
      createBillLineSummaryId({ ...identity })
    )
    expect(createBillLineSummaryId({ ...identity, type: "tip" })).not.toBe(
      createBillLineSummaryId(identity)
    )
  })
})
