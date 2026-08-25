import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"

export const catalogCategoryByIdQuery = (idValue: CatalogCategoryId) =>
  createQuery((db) =>
    db
      .selectFrom("catalogCategory")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("sortOrder", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        name: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()
  )

export const catalogCategoriesQuery = createQuery((db) =>
  db
    .selectFrom("catalogCategory")
    .selectAll()
    .where("name", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)
