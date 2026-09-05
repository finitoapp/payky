import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import { buildDiacriticInsensitiveSearchCondition } from "@/lib/sql-text-search.ts"
import type { TableId } from "./table-types.ts"

export const tablesQuery = createQuery((db) =>
  db
    .selectFrom("table")
    .selectAll()
    .where("name", "is not", null)
    .where("seatCount", "is not", null)
    .where("code", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .$narrowType<{
      name: KyselyNotNull
      seatCount: KyselyNotNull
      code: KyselyNotNull
      sortOrder: KyselyNotNull
    }>()
    .orderBy("sortOrder", "asc")
)

/**
 * Whether at least one (non-deleted) table exists, independent of any
 * search filter — cheaper than loading full rows just to check.
 */
export const tablesExistQuery = createQuery((db) =>
  db
    .selectFrom("table")
    .select("id")
    .where("name", "is not", null)
    .where("seatCount", "is not", null)
    .where("code", "is not", null)
    .where("sortOrder", "is not", null)
    .where("isDeleted", "is", null)
    .limit(1)
)

/**
 * A page of tables, filtered in SQL (not over an already-loaded result set)
 * by free text — case- and diacritic-insensitive across `name`. Pass
 * `limit: pageSize + 1` and slice off the extra row to detect whether more
 * items remain without a separate count query.
 */
export const tablesPageQuery = ({
  search,
  limit,
}: {
  readonly search: string
  readonly limit: number
}) =>
  createQuery((db) => {
    let query = db
      .selectFrom("table")
      .selectAll()
      .where("name", "is not", null)
      .where("seatCount", "is not", null)
      .where("code", "is not", null)
      .where("sortOrder", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        name: KyselyNotNull
        seatCount: KyselyNotNull
        code: KyselyNotNull
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

export const tableByIdQuery = (idValue: TableId) =>
  createQuery((db) =>
    db
      .selectFrom("table")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("seatCount", "is not", null)
      .where("code", "is not", null)
      .where("sortOrder", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        seatCount: KyselyNotNull
        code: KyselyNotNull
        sortOrder: KyselyNotNull
      }>()
  )
