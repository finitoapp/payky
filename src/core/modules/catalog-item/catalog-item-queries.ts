import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { CategoryFilter } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { buildDiacriticInsensitiveSearchCondition } from "@/lib/sql-text-search.ts"

export const catalogItemByIdQuery = (idValue: CatalogItemId) =>
  createQuery((db) =>
    db
      .selectFrom("catalogItem")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("currency", "is not", null)
      .where("unitAmount", "is not", null)
      .where("sortOrder", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()
  )

export const catalogItemsQuery = createQuery((db) =>
  db
    .selectFrom("catalogItem")
    .selectAll()
    .where("name", "is not", null)
    .where("currency", "is not", null)
    .where("unitAmount", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      currency: KyselyNotNull
      unitAmount: KyselyNotNull
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

/**
 * The highest `sortOrder` in use, for appending an item after the last one —
 * see `getNextSortOrder`. Same predicates as `catalogItemsQuery` so it names
 * the same row that query's last entry did, but one row instead of the whole
 * catalog with every column. Served by the `catalogItem_sortOrder` index.
 */
export const lastCatalogItemSortOrderQuery = createQuery((db) =>
  db
    .selectFrom("catalogItem")
    .select("sortOrder")
    .where("name", "is not", null)
    .where("currency", "is not", null)
    .where("unitAmount", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "desc")
    .limit(1)
)

/**
 * The distinct `categoryId` values used by any (non-deleted) catalog item,
 * for driving a category filter's chip list. A non-empty result also means
 * at least one catalog item exists at all, independent of any text/category
 * filter — cheaper than loading full rows just to check for that.
 */
export const catalogItemUsedCategoryIdsQuery = createQuery((db) =>
  db
    .selectFrom("catalogItem")
    .select("categoryId")
    .distinct()
    .where("name", "is not", null)
    .where("currency", "is not", null)
    .where("unitAmount", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
)

/**
 * A page of catalog items, filtered in SQL (not over an already-loaded
 * result set) by free text — case- and diacritic-insensitive across `name`,
 * `internalName`, `sku`, and `scanCode` — by category, and optionally by
 * `currency` (the bill cart grid only offers items in the bill's own
 * currency). Pass `limit: pageSize + 1` and slice off the extra row to
 * detect whether more items remain without a separate count query.
 */
export const catalogItemsPageQuery = ({
  search,
  categoryFilter,
  currency,
  limit,
}: {
  readonly search: string
  readonly categoryFilter: CategoryFilter
  readonly currency?: FiatCurrency
  readonly limit: number
}) =>
  createQuery((db) => {
    let query = db
      .selectFrom("catalogItem")
      .selectAll()
      .where("name", "is not", null)
      .where("currency", "is not", null)
      .where("unitAmount", "is not", null)
      .where("sortOrder", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        name: KyselyNotNull
        currency: KyselyNotNull
        unitAmount: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()

    if (currency !== undefined) {
      query = query.where("currency", "=", currency)
    }

    const term = search.trim()
    if (term !== "") {
      query = query.where((eb) =>
        buildDiacriticInsensitiveSearchCondition(
          eb,
          ["name", "internalName", "sku", "scanCode"],
          term
        )
      )
    }

    if (categoryFilter === "uncategorized") {
      query = query.where("categoryId", "is", null)
    } else if (categoryFilter !== "all") {
      query = query.where("categoryId", "=", categoryFilter)
    }

    return query.orderBy("sortOrder", "asc").limit(limit)
  })
