import type { Query, QueryRows, Row } from "@evolu/common"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useEvoluQueryFor } from "@/hooks/use-evolu-query-for.ts"

/**
 * `useEvoluQuery` for a query that only exists in some states, for example a
 * bill-scoped query on a cart whose bill hasn't been created yet. A `null`
 * query subscribes to nothing and yields no rows, which lets a component
 * that owns both states stay mounted across the transition instead of being
 * torn down and rebuilt — a remount replaces every DOM node under it, and a
 * tap whose press and release straddle that swap is silently dropped by the
 * browser (its click lands on the two nodes' common ancestor, not on the
 * button). See `BillPage`.
 */
export const useOptionalEvoluQuery = <R extends Row>(
  query: Query<EvoluSchema, R> | null
): { data: QueryRows<R> } => useEvoluQueryFor(useEvolu(), query)

export const useEvoluQuery = <R extends Row>(
  query: Query<EvoluSchema, R>
): { data: QueryRows<R> } => useOptionalEvoluQuery(query)
