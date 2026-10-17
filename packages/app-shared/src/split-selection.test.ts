import type { BillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import { describe, expect, test } from "vitest"
import {
  canConfirmSplit,
  deriveSplitItems,
  selectAllForSplit,
  setSplitQuantity,
} from "./split-selection.ts"

const beer = {
  id: "line-1",
  quantity: 3,
  totalAmount: 150,
} as unknown as BillLineSummary
const cake = {
  id: "line-2",
  quantity: 1,
  totalAmount: 90,
} as unknown as BillLineSummary

describe("split selection", () => {
  test("clamps a picked quantity to what the bill holds", () => {
    expect(setSplitQuantity({}, beer, 9)).toEqual({ "line-1": 3 })
    expect(setSplitQuantity({ "line-1": 2 }, beer, -1)).toEqual({ "line-1": 0 })
  })

  test("selects every unit of every line", () => {
    expect(selectAllForSplit([beer, cake])).toEqual({
      "line-1": 3,
      "line-2": 1,
    })
  })

  test("prices the moved portion by the unit amount and skips unpicked lines", () => {
    const items = deriveSplitItems([beer, cake], { "line-1": 2, "line-2": 0 })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: "line-1",
      quantity: 2,
      totalAmount: 100,
    })
  })

  test("needs items, no pending split and a target for an existing bill", () => {
    const target = "bill-2" as unknown as BillId
    const base = { itemCount: 1, pending: false, targetBillId: null }
    expect(canConfirmSplit({ ...base, destination: "new" })).toBe(true)
    expect(canConfirmSplit({ ...base, destination: "existing" })).toBe(false)
    expect(
      canConfirmSplit({
        ...base,
        destination: "existing",
        targetBillId: target,
      })
    ).toBe(true)
    expect(canConfirmSplit({ ...base, itemCount: 0, destination: "new" })).toBe(
      false
    )
    expect(
      canConfirmSplit({ ...base, pending: true, destination: "new" })
    ).toBe(false)
  })
})
