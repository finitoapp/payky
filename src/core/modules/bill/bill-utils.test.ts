import { describe, expect, test } from "vitest"

import type { BillItemLineRow } from "@/core/modules/bill-item-line/bill-item-line.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { calculateBillItems } from "./bill-utils.ts"

describe("bill item projection", () => {
  test("calculates bill items from item lines without persistence", () => {
    const item: ItemRow = {
      id: "item-1",
      catalogItemId: "catalog-1",
      name: "Coffee",
      description: null,
      currency: "CZK",
      unitAmount: 5900,
    }
    const lines: ReadonlyArray<BillItemLineRow> = [
      {
        id: "line-1",
        billId: "bill-1",
        deviceId: null,
        catalogItemId: "catalog-1",
        itemId: item.id,
        type: "catalogItem",
        kind: "add",
        quantity: 2,
        totalAmount: 11800,
      },
      {
        id: "line-2",
        billId: "bill-1",
        deviceId: null,
        catalogItemId: "catalog-1",
        itemId: item.id,
        type: "catalogItem",
        kind: "remove",
        quantity: 1,
        totalAmount: 5900,
      },
    ]

    expect(calculateBillItems(lines, [item])).toMatchObject([
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
})
