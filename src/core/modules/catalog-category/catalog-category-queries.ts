import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { buildDiacriticInsensitiveSearchCondition } from "@/lib/sql-text-search.ts"

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

/**
 * The highest `sortOrder` in use, for appending a category after the last one
 * — see `getNextSortOrder`. Same predicates as `catalogCategoriesQuery` so it
 * names the same row that query's last entry did, but one row instead of every
 * category with every column. Unindexed: categories are counted in dozens, and
 * an index on them would cost every write to earn a scan nobody notices.
 */
export const lastCatalogCategorySortOrderQuery = createQuery((db) =>
  db
    .selectFrom("catalogCategory")
    .select("sortOrder")
    .where("name", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "desc")
    .limit(1)
)

/**
 * Whether at least one (non-deleted) catalog category exists, independent
 * of any search filter — cheaper than loading full rows just to check.
 */
export const catalogCategoriesExistQuery = createQuery((db) =>
  db
    .selectFrom("catalogCategory")
    .select("id")
    .where("name", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .limit(1)
)

/**
 * A page of catalog categories, filtered in SQL (not over an already-loaded
 * result set) by free text — case- and diacritic-insensitive across `name`.
 * Pass `limit: pageSize + 1` and slice off the extra row to detect whether
 * more items remain without a separate count query.
 */
export const catalogCategoriesPageQuery = ({
  search,
  limit,
}: {
  readonly search: string
  readonly limit: number
}) =>
  createQuery((db) => {
    let query = db
      .selectFrom("catalogCategory")
      .selectAll()
      .where("name", "is not", null)
      .where("sortOrder", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        name: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()

    const term = search.trim()
    if (term !== "") {
      query = query.where((eb) =>
        buildDiacriticInsensitiveSearchCondition(eb, ["name"], term)
      )
    }

    return query.orderBy("sortOrder", "asc").limit(limit)
  })
