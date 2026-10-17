import type { Evolu, Query, QueryRows, Row } from "@evolu/common"
import type { EvoluSchema } from "@payky/core/evolu/schema"
import { useMemo, useState, useTransition } from "react"
import { useEvoluQueryFor } from "./use-evolu-query-for.ts"

/** Shallow equality for a deps array, the same rule `useEffect`/`useMemo` use for theirs. */
function depsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return (
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index]))
  )
}

/**
 * Pagination over any Evolu query, for both apps: grows a `limit` and exposes
 * `loadMore`; each app binds it to its own trigger (web's intersection
 * sentinel, native's `FlatList` `onEndReached`).
 *
 * `createPageQuery` should build a query for the *current* filters (search
 * text, category, ...) with the given `limit`; it requests `limit + 1` rows
 * internally and slices off the extra one to detect `hasMore` without a
 * separate count query. `deps` must list every value `createPageQuery`
 * closes over (the same convention as `useEffect`/`useMemo`), so pagination
 * resets to the first page exactly when one of them changes — a shallow
 * `Object.is` comparison per index, not a hand-joined string, so a new
 * filter can't be forgotten out of sync and a free-text value can't
 * accidentally collide with another filter's.
 *
 * Growing the limit happens inside `startTransition`, so React keeps the
 * already-rendered rows on screen while the bigger page loads (`isPending`)
 * instead of falling back to the nearest Suspense boundary — that fallback
 * still fires normally when `deps` changes, since that's a plain
 * (non-transition) update.
 */
export function useInfinitePages<R extends Row>(
  evolu: Evolu<EvoluSchema>,
  deps: readonly unknown[],
  createPageQuery: (limit: number) => Query<EvoluSchema, R>,
  { pageSize = 20 }: { readonly pageSize?: number } = {}
): {
  readonly rows: QueryRows<R>
  readonly hasMore: boolean
  readonly isPending: boolean
  readonly loadMore: () => void
} {
  const [state, setState] = useState({ deps, limit: pageSize })
  // Reset pagination back to the first page when the filter identity
  // changes, without an extra render round-trip through an effect (see
  // "Adjusting state when a prop changes" in the React docs).
  if (!depsEqual(state.deps, deps)) {
    setState({ deps, limit: pageSize })
  }
  const [isPending, startTransition] = useTransition()

  const query = useMemo(
    () => createPageQuery(state.limit + 1),
    [createPageQuery, state.limit]
  )
  const { data: rows } = useEvoluQueryFor(evolu, query)
  const hasMore = rows.length > state.limit
  const visibleRows = hasMore ? rows.slice(0, state.limit) : rows

  const loadMore = () => {
    startTransition(() => {
      setState((current) => ({ ...current, limit: current.limit + pageSize }))
    })
  }

  return { rows: visibleRows, hasMore, isPending, loadMore }
}
