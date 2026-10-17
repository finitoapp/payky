import type { Query, QueryRows, Row } from "@evolu/common"
import { useInfinitePages } from "@payky/app-shared/use-infinite-evolu-query"
import type { EvoluSchema } from "@payky/core/evolu/schema"
import { useIntersectionObserver } from "@payky/web-shared/use-intersection-observer"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * Infinite-scroll pagination over any Evolu query: `useInfinitePages` (see
 * it for the `createPageQuery`/`deps` contract) plus a sentinel ref that
 * loads the next page when it scrolls into view.
 */
export function useInfiniteEvoluQuery<R extends Row>(
  deps: readonly unknown[],
  createPageQuery: (limit: number) => Query<EvoluSchema, R>,
  options: { readonly pageSize?: number } = {}
): {
  readonly rows: QueryRows<R>
  readonly hasMore: boolean
  readonly isPending: boolean
  readonly sentinelRef: (node: HTMLDivElement | null) => void
} {
  const { loadMore, ...pages } = useInfinitePages(
    useEvolu(),
    deps,
    createPageQuery,
    options
  )

  const sentinelRef = useIntersectionObserver<HTMLDivElement>(loadMore, {
    enabled: pages.hasMore && !pages.isPending,
  })

  return { ...pages, sentinelRef }
}
