import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createItemIdFromSnapshot } from "./item-utils.ts"

describe("Evolu item identity helpers", () => {
  test("creates stable item ids from canonical snapshot values", () => {
    const snapshot = {
      catalogItemId: createIdFromString<"CatalogItem">("catalog-1"),
      name: NonEmptyString255("Coffee"),
      description: null,
      currency: "CZK" as const,
      unitAmount: NonNegativeInteger(5900),
    }

    expect(createItemIdFromSnapshot(snapshot)).toBe(
      createItemIdFromSnapshot({ ...snapshot })
    )
    expect(
      createItemIdFromSnapshot({
        ...snapshot,
        unitAmount: NonNegativeInteger(6900),
      })
    ).not.toBe(createItemIdFromSnapshot(snapshot))
  })
})
