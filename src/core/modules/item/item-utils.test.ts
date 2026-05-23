import { describe, expect, test } from "vitest"

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
})
