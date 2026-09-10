import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"

export const taxRatesQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .selectAll()
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      rate: KyselyNotNull
      sortOrder: KyselyNotNull
      isDefault: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

export const activeTaxRatesQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .selectAll()
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "is not", null)
    .where("isDeleted", "is", null)
    .where("deactivatedAt", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      rate: KyselyNotNull
      sortOrder: KyselyNotNull
      isDefault: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

/**
 * The highest `sortOrder` in use, for appending a rate after the last one —
 * see `getNextSortOrder`. Same predicates as `taxRatesQuery`, `deactivatedAt`
 * included: an archived rate keeps its place, so the next rate goes after it
 * rather than on top of it. Served by the `taxRate_sortOrder` index.
 */
export const lastTaxRateSortOrderQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .select("sortOrder")
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "desc")
    .limit(1)
)

/**
 * The rates currently flagged default — normally one, and only ever more than
 * one if two devices set a default concurrently. The rows a new default has to
 * unset, without reading the rates it leaves alone.
 */
export const defaultTaxRatesQuery = createQuery((db) =>
  db
    .selectFrom("taxRate")
    .select("id")
    .where("name", "is not", null)
    .where("rate", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDefault", "=", sqliteTrue)
    .where("isDeleted", "is", null)
)
