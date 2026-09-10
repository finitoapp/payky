import { ChevronRight, TagIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { catalogItemsPageQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  type CategoryFilter,
  getStaffDisplayName,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { SettingsEntityList } from "@/features/settings/settings-entity-list.tsx"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

export function ItemsList({
  search,
  categoryFilter,
  hasAny,
  categories,
}: {
  readonly search: string
  readonly categoryFilter: CategoryFilter
  readonly hasAny: boolean
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

  return (
    <SettingsEntityList
      deps={[search, categoryFilter]}
      createPageQuery={createPageQuery}
      hasAny={hasAny}
      emptyTitle={t("settings.items.empty.title")}
      emptyDescription={t("settings.items.empty.description")}
      emptySearchLabel={t("settings.items.emptySearch")}
      renderItem={(item) => ({
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
      })}
    />
  )
}
