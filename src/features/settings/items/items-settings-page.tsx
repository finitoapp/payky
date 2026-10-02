import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, Suspense, useMemo, useState } from "react"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import {
  catalogItemsQuery,
  catalogItemUsedCategoryIdsQuery,
} from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  type CategoryFilter,
  findCatalogItemsByScanCode,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { CategoryFilterBar } from "@/features/catalog/category-filter-bar.tsx"
import { ItemsList } from "@/features/settings/items/items-list.tsx"
import { SettingsListPage } from "@/features/settings/settings-list-page.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useHardwareScanner } from "@/hooks/use-hardware-scanner.ts"
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
        rawSearch={search}
        onSearchChange={setSearch}
        search={debouncedSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
      />
    </Suspense>
  )
}

function ItemsSettingsContent({
  searchInput,
  rawSearch,
  onSearchChange,
  search,
  categoryFilter,
  onCategoryFilterChange,
}: {
  readonly searchInput: ReactNode
  /** The search field's own, undebounced text. */
  readonly rawSearch: string
  readonly onSearchChange: (value: string) => void
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

  const navigate = useNavigate()
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  // A scan opens the item it identifies, or a new one carrying the code.
  // Several matches (the code is not unique across devices) are left to the
  // list: searching for the code shows exactly them.
  useHardwareScanner({
    enabled: true,
    onScan: (code) => {
      const matches = findCatalogItemsByScanCode(catalogItems, code)
      const [match] = matches
      if (matches.length > 1) {
        onSearchChange(code)
        return
      }
      // A focused search field received the code's characters too.
      if (rawSearch.endsWith(code)) {
        onSearchChange(rawSearch.slice(0, -code.length))
      }
      void (match === undefined
        ? navigate({ to: "/settings/items/new", search: { scan: code } })
        : navigate({
            to: "/settings/items/$catalogItemId",
            params: { catalogItemId: match.id },
          }))
    },
  })

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
