import { createIdFromString } from "@evolu/common"

import type { CatalogItemRow } from "../catalog-item/catalog-item.ts"
import type { ItemRow } from "./item.ts"
import type { ItemId } from "./item-types.ts"

export const createItemIdFromSnapshot = (
  snapshot: Omit<ItemRow, "id">
): ItemId =>
  createIdFromString<"Item">(
    JSON.stringify({
      catalogItemId: snapshot.catalogItemId,
      name: snapshot.name,
      description: snapshot.description,
      currency: snapshot.currency,
      unitAmount: snapshot.unitAmount,
      taxRateId: snapshot.taxRateId,
    })
  )

export const createCatalogItemSnapshot = (
  catalogItem: CatalogItemRow
): ItemRow => {
  const snapshot: Omit<ItemRow, "id"> = {
    catalogItemId: catalogItem.id,
    name: catalogItem.name,
    description: catalogItem.description,
    currency: catalogItem.currency,
    unitAmount: catalogItem.unitAmount,
    taxRateId: catalogItem.taxRateId,
  }

  return {
    ...snapshot,
    id: createItemIdFromSnapshot(snapshot),
  }
}

export const createStandaloneItemSnapshot = (
  snapshot: Omit<ItemRow, "id">
): ItemRow => ({
  ...snapshot,
  id: createItemIdFromSnapshot(snapshot),
})
