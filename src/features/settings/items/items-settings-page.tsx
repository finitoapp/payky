import { type ReactNode, Suspense, useMemo, useState } from "react"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { catalogItemUsedCategoryIdsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { CategoryFilter } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { CategoryFilterBar } from "@/features/catalog/category-filter-bar.tsx"
import { ItemsList } from "@/features/settings/items/items-list.tsx"
import { SettingsListPage } from "@/features/settings/settings-list-page.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function ItemsSettingsPage() {
  const { t } = useTranslation()

  return (
    <SettingsListPage
      title={t("settings.items.title")}
      addAriaLabel={t("settings.items.add")}
      addTo="/settings/items/new"
    >
      <ItemsSettingsBody />
    </SettingsListPage>
  )
}

function ItemsSettingsBody() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const debouncedSearch = useDebouncedValue(search, 250)

  const searchInput = (
    <SearchInput
      value={search}
      onChange={setSearch}
      placeholder={t("settings.items.search")}
      clearAriaLabel={t("settings.items.search.clear.aria")}
    />
  )

  return (
    <Suspense
      fallback={
        <>
          {searchInput}
          <ListSkeleton />
        </>
      }
    >
      <ItemsSettingsContent
        searchInput={searchInput}
        search={debouncedSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
      />
    </Suspense>
  )
}

function ItemsSettingsContent({
  searchInput,
  search,
  categoryFilter,
  onCategoryFilterChange,
}: {
  readonly searchInput: ReactNode
  readonly search: string
  readonly categoryFilter: CategoryFilter
  readonly onCategoryFilterChange: (value: CategoryFilter) => void
}) {
  const { t } = useTranslation()
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const { data: usedCategoryIdRows } = useEvoluQuery(
    catalogItemUsedCategoryIdsQuery
  )
  const usedCategoryIds = useMemo(
    () => new Set(usedCategoryIdRows.map((row) => row.categoryId)),
    [usedCategoryIdRows]
  )
  const hasAny = usedCategoryIds.size > 0

  return (
    <>
      {hasAny && searchInput}

      <CategoryFilterBar
        categories={categories}
        usedCategoryIds={usedCategoryIds}
        value={categoryFilter}
        onValueChange={onCategoryFilterChange}
        allLabel={t("settings.items.category.all")}
        uncategorizedLabel={t("settings.items.category.uncategorized")}
      />

      <Suspense fallback={<ListSkeleton />}>
        <ItemsList
          search={search}
          categoryFilter={categoryFilter}
          hasAny={hasAny}
          categories={categories}
        />
      </Suspense>
    </>
  )
}
