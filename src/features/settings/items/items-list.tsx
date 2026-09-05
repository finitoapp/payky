import { ChevronRight, TagIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { catalogItemsPageQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  type CategoryFilter,
  getStaffDisplayName,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * Infinite-scroll catalog item list. Filters run in SQL via
 * `catalogItemsPageQuery` (see there), not over an already-loaded result
 * set. Pagination itself is handled by `useInfiniteEvoluQuery` — see there
 * for how "load more" keeps already-rendered rows on screen while changing
 * `search`/`categoryFilter` shows a full-list skeleton via the parent's
 * `<Suspense>` boundary.
 */
export function ItemsList({
  search,
  categoryFilter,
  hasAnyItems,
  categories,
}: {
  readonly search: string
  readonly categoryFilter: CategoryFilter
  readonly hasAnyItems: boolean
  readonly categories: ReadonlyArray<{
    readonly id: CatalogCategoryId
    readonly name: string
  }>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const createPageQuery = useCallback(
    (limit: number) => catalogItemsPageQuery({ search, categoryFilter, limit }),
    [search, categoryFilter]
  )
  const {
    rows: visibleRows,
    hasMore,
    isPending,
    sentinelRef,
  } = useInfiniteEvoluQuery(`${search}::${categoryFilter}`, createPageQuery)

  return (
    <>
      <VerticalNav
        empty={
          !hasAnyItems ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-lg font-semibold">
                {t("settings.items.empty.title")}
              </p>
              <p className="text-balance text-sm text-muted-foreground">
                {t("settings.items.empty.description")}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-muted-foreground">
              {t("settings.items.emptySearch")}
            </p>
          )
        }
        items={visibleRows.map((item) => ({
          id: item.id,
          kind: "link" as const,
          to: "/settings/items/$catalogItemId",
          params: { catalogItemId: item.id },
          icon: <TagIcon className="text-muted-foreground" />,
          label: (
            <span className="flex flex-col">
              <span>{getStaffDisplayName(item)}</span>
              {item.categoryId !== null &&
                categoryNameById.get(item.categoryId) !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {categoryNameById.get(item.categoryId)}
                  </span>
                )}
            </span>
          ),
          action: (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                {formatMoney(
                  { value: Integer(item.unitAmount), currency: item.currency },
                  locale
                )}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
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
