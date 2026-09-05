import { Table2Icon } from "lucide-react"
import { useCallback } from "react"

import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { tablesPageQuery } from "@/core/modules/table/table-queries.ts"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Infinite-scroll table list. Filters run in SQL via `tablesPageQuery` (see
 * there), not over an already-loaded result set. Pagination itself is
 * handled by `useInfiniteEvoluQuery` — see there for how "load more" keeps
 * already-rendered rows on screen while changing `search` shows a
 * full-list skeleton via the parent's `<Suspense>` boundary.
 */
export function TablesList({
  search,
  hasAnyTables,
}: {
  readonly search: string
  readonly hasAnyTables: boolean
}) {
  const { t } = useTranslation()

  const createPageQuery = useCallback(
    (limit: number) => tablesPageQuery({ search, limit }),
    [search]
  )
  const {
    rows: visibleRows,
    hasMore,
    isPending,
    sentinelRef,
  } = useInfiniteEvoluQuery([search], createPageQuery)

  return (
    <>
      <VerticalNav
        empty={
          !hasAnyTables ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-lg font-semibold">
                {t("settings.tables.empty.title")}
              </p>
              <p className="text-balance text-sm text-muted-foreground">
                {t("settings.tables.empty.description")}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-muted-foreground">
              {t("settings.tables.emptySearch")}
            </p>
          )
        }
        items={visibleRows.map((table) => ({
          id: table.id,
          kind: "link" as const,
          to: "/settings/tables/$tableId",
          params: { tableId: table.id },
          icon: <Table2Icon className="text-muted-foreground" />,
          label: table.name,
          action: (
            <span className="text-sm font-medium text-muted-foreground">
              {t("settings.tables.seatCount", { value: table.seatCount })}
            </span>
          ),
        }))}
      />
      {hasMore && (
        <>
          {isPending && <ListSkeleton rows={5} />}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </>
      )}
    </>
  )
}
