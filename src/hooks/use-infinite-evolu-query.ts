import type { Query, QueryRows, Row } from "@evolu/common"
import { useMemo, useState, useTransition } from "react"
import type { EvoluSchema } from "@/core/evolu/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer.ts"

/**
 * Infinite-scroll pagination over any Evolu query: grows a `limit` and
 * exposes a sentinel ref that triggers loading the next page when it
 * scrolls into view. Generic over the row type and how the query is
 * built — reusable for any list, not just one feature's.
 *
 * `createPageQuery` should build a query for the *current* filters (search
 * text, category, ...) with the given `limit`; it requests `limit + 1` rows
 * internally and slices off the extra one to detect `hasMore` without a
 * separate count query. `filterKey` must change whenever the filters
 * `createPageQuery` closes over change, so pagination resets to the first
 * page.
 *
 * Growing the limit happens inside `startTransition`, so React keeps the
 * already-rendered rows on screen while the bigger page loads (`isPending`)
 * instead of falling back to the nearest Suspense boundary — that fallback
 * still fires normally when `filterKey` changes, since that's a plain
 * (non-transition) update.
 */
export function useInfiniteEvoluQuery<R extends Row>(
  filterKey: string,
  createPageQuery: (limit: number) => Query<EvoluSchema, R>,
  { pageSize = 20 }: { readonly pageSize?: number } = {}
): {
  readonly rows: QueryRows<R>
  readonly hasMore: boolean
  readonly isPending: boolean
  readonly sentinelRef: (node: HTMLDivElement | null) => void
} {
  const [state, setState] = useState({ filterKey, limit: pageSize })
  // Reset pagination back to the first page when the filter identity
  // changes, without an extra render round-trip through an effect (see
  // "Adjusting state when a prop changes" in the React docs).
  if (state.filterKey !== filterKey) {
    setState({ filterKey, limit: pageSize })
  }
  const [isPending, startTransition] = useTransition()

  const query = useMemo(
    () => createPageQuery(state.limit + 1),
    [createPageQuery, state.limit]
  )
  const { data: rows } = useEvoluQuery(query)
  const hasMore = rows.length > state.limit
  const visibleRows = hasMore ? rows.slice(0, state.limit) : rows

  const sentinelRef = useIntersectionObserver<HTMLDivElement>(
    () => {
      startTransition(() => {
        setState((current) => ({ ...current, limit: current.limit + pageSize }))
      })
    },
    { enabled: hasMore && !isPending }
  )

  return { rows: visibleRows, hasMore, isPending, sentinelRef }
}
