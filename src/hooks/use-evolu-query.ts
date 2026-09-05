import type { Query, QueryRows, Row } from "@evolu/common"
import { use, useMemo, useSyncExternalStore } from "react"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
import { useEvolu } from "@/hooks/use-evolu"

const emptyRows: ReadonlyArray<never> = []
const subscribeToNothing = (): (() => void) => () => {}

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
): { data: QueryRows<R> } => {
  const evolu = useEvolu()

  // `use` is the one hook React allows to be called conditionally.
  if (query !== null) use(evolu.loadQuery(query))

  const data = useSyncExternalStore(
    useMemo(
      () => (query === null ? subscribeToNothing : evolu.subscribeQuery(query)),
      [evolu, query]
    ),
    useMemo(
      () => () => (query === null ? emptyRows : evolu.getQueryRows(query)),
      [evolu, query]
    )
  )

  return {
    data: data as QueryRows<R>,
  }
}

export const useEvoluQuery = <R extends Row>(
  query: Query<EvoluSchema, R>
): { data: QueryRows<R> } => useOptionalEvoluQuery(query)
