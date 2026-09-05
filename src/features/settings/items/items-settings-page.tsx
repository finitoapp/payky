import { Link } from "@tanstack/react-router"
import { ChevronRight, PlusIcon, TagIcon } from "lucide-react"

import { useMemo, useState } from "react"

import { CategoryFilterBar } from "@/components/category-filter-bar.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { catalogItemsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  type CategoryFilter,
  filterCatalogItemsByCategory,
  getStaffDisplayName,
  matchesCatalogItemSearch,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

export function ItemsSettingsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: items } = useEvoluQuery(catalogItemsQuery)
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const usedCategoryIds = useMemo(
    () => new Set(items.map((item) => item.categoryId)),
    [items]
  )
  const categoryFilteredItems = useMemo(
    () => filterCatalogItemsByCategory(items, categoryFilter),
    [items, categoryFilter]
  )
  const filteredItems = useMemo(
    () =>
      categoryFilteredItems.filter((item) =>
        matchesCatalogItemSearch(item, search)
      ),
    [categoryFilteredItems, search]
  )

  return (
    <div className={"flex flex-col gap-2"}>
      <div className="h-6" />
      <FadeHeader
        title={t("settings.items.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                aria-label={t("settings.items.add")}
                to="/settings/items/new"
              />
            }
          >
            <PlusIcon className="text-primary size-5" strokeWidth={3} />
          </Button>
        }
      />

      {items.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.items.search")}
          clearAriaLabel={t("settings.items.search.clear.aria")}
        />
      )}

      <CategoryFilterBar
        categories={categories}
        usedCategoryIds={usedCategoryIds}
        value={categoryFilter}
        onValueChange={setCategoryFilter}
        allLabel={t("settings.items.category.all")}
        uncategorizedLabel={t("settings.items.category.uncategorized")}
      />

      <VerticalNav
        empty={
          items.length === 0 ? (
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
        items={filteredItems.map((item) => ({
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
    </div>
  )
}
