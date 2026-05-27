import { describe, expect, test } from "vitest"

import { createBillItemId } from "@/modules/bill-item/bill-item-utils.ts"
import { createItemIdFromSnapshot } from "./item-utils.ts"

describe("Evolu item identity helpers", () => {
  test("creates stable item ids from canonical snapshot values", () => {
    const snapshot = {
      catalogItemId: "catalog-1",
      name: "Coffee",
      description: null,
      currency: "CZK" as const,
      unitAmount: 5900,
    }

    expect(createItemIdFromSnapshot(snapshot)).toBe(
      createItemIdFromSnapshot({ ...snapshot })
    )
    expect(
      createItemIdFromSnapshot({ ...snapshot, unitAmount: 6900 })
    ).not.toBe(createItemIdFromSnapshot(snapshot))
  })

  test("creates stable bill item ids from projection identity", () => {
    const identity = {
      billId: "bill-1",
      catalogItemId: "catalog-1",
      itemId: "item-1",
      type: "catalogItem" as const,
    }

    expect(createBillItemId(identity)).toBe(createBillItemId({ ...identity }))
    expect(createBillItemId({ ...identity, type: "tip" })).not.toBe(
      createBillItemId(identity)
    )
  })
})
