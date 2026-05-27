import { createIdFromString } from "@evolu/common"

import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import type { ItemRow } from "./item.ts"

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
