import { describe, expect, test } from "vitest"

import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import {
  calculateBillLineSummaries,
  createBillLineSummaryId,
} from "./bill-utils.ts"

describe("bill line summaries", () => {
  test("calculates summaries from bill lines without persistence", () => {
    const item: ItemRow = {
      id: "item-1",
      catalogItemId: "catalog-1",
      name: "Coffee",
      description: null,
      currency: "CZK",
      unitAmount: 5900,
    }
    const lines: ReadonlyArray<BillLineRow> = [
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
      billId: "bill-1",
      catalogItemId: "catalog-1",
      itemId: "item-1",
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
