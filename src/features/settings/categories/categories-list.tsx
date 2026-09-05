import { FolderIcon } from "lucide-react"
import { useCallback } from "react"

import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { catalogCategoriesPageQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Infinite-scroll catalog category list. Filters run in SQL via
 * `catalogCategoriesPageQuery` (see there), not over an already-loaded
 * result set. Pagination itself is handled by `useInfiniteEvoluQuery` — see
 * there for how "load more" keeps already-rendered rows on screen while
 * changing `search` shows a full-list skeleton via the parent's
 * `<Suspense>` boundary.
 */
export function CategoriesList({
  search,
  hasAnyCategories,
}: {
  readonly search: string
  readonly hasAnyCategories: boolean
}) {
  const { t } = useTranslation()

  const createPageQuery = useCallback(
    (limit: number) => catalogCategoriesPageQuery({ search, limit }),
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
          !hasAnyCategories ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-lg font-semibold">
                {t("settings.categories.empty.title")}
              </p>
              <p className="text-balance text-sm text-muted-foreground">
                {t("settings.categories.empty.description")}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-muted-foreground">
              {t("settings.categories.emptySearch")}
            </p>
          )
        }
        items={visibleRows.map((category) => ({
          id: category.id,
          kind: "link" as const,
          to: "/settings/categories/$catalogCategoryId",
          params: { catalogCategoryId: category.id },
          icon: <FolderIcon className="text-muted-foreground" />,
          label: category.name,
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
