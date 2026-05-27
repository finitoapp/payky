import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/evolu/schema.ts"
import type { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"

export const catalogItemByIdQuery = (idValue: CatalogItemId) =>
  createQuery((db) =>
    db
      .selectFrom("catalogItem")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("currency", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()
  )

export const catalogItemsQuery = createQuery((db) =>
  db.selectFrom("catalogItem").selectAll().orderBy("sortOrder", "asc")
)
