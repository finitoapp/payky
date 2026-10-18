import { formatMoney } from "@payky/app-shared/format-money"
import { catalogCategoriesQuery } from "@payky/core/modules/catalog-category/catalog-category-queries"
import {
  catalogItemsPageQuery,
  catalogItemUsedCategoryIdsQuery,
} from "@payky/core/modules/catalog-item/catalog-item-queries"
import type { CategoryFilter } from "@payky/core/modules/catalog-item/catalog-item-types"
import { getStaffDisplayName } from "@payky/core/modules/catalog-item/catalog-item-utils"
import { Integer } from "@payky/core/modules/shared/schema"
import { Suspense, useCallback, useMemo, useState } from "react"
import { YStack } from "tamagui"
import { SearchField } from "../../../components/search-field.tsx"
import { LoadingView } from "../../../components/state-views.tsx"
import { useDebouncedValue } from "../../../hooks/use-debounced-value.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { CategoryFilterBar } from "../../shared/category-filter-bar.tsx"
import {
  SettingsEntityList,
  SettingsListShell,
} from "../settings-list-parts.tsx"

/** Catalog items, as web's `ItemsSettingsPage`. */
export function ItemsSettingsPage() {
  const { t } = useTranslation()
  return (
    <SettingsListShell
      title={t("settings.items.title")}
      addLabel={t("settings.items.add")}
      addHref="/settings/items/new"
    >
      <ItemsSettingsBody />
    </SettingsListShell>
  )
}

// ponytail: web's hardware-scanner shortcut (a scan opens or creates an item)
// is not ported; the scan code is still searched and edited as text.
function ItemsSettingsBody() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const debouncedSearch = useDebouncedValue(search, 250)
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
    <YStack flex={1} gap="3">
      {hasAny && (
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("settings.items.search")}
          clearLabel={t("settings.items.search.clear.aria")}
        />
      )}
      <CategoryFilterBar<never>
        categories={categories}
        usedCategoryIds={usedCategoryIds}
        value={categoryFilter}
        onValueChange={setCategoryFilter}
        allLabel={t("settings.items.category.all")}
        uncategorizedLabel={t("settings.items.category.uncategorized")}
      />
      <Suspense fallback={<LoadingView />}>
        <ItemsList
          search={debouncedSearch}
          categoryFilter={categoryFilter}
          hasAny={hasAny}
          categories={categories}
        />
      </Suspense>
    </YStack>
  )
}

function ItemsList({
  search,
  categoryFilter,
  hasAny,
  categories,
}: {
  readonly search: string
  readonly categoryFilter: CategoryFilter
  readonly hasAny: boolean
  readonly categories: ReadonlyArray<{
    readonly id: string
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
      renderRow={(item) => ({
        id: item.id,
        title: getStaffDisplayName(item),
        href: `/settings/items/${item.id}`,
        subtitle:
          item.categoryId === null
            ? undefined
            : categoryNameById.get(item.categoryId),
        trailing: formatMoney(
          { value: Integer(item.unitAmount), currency: item.currency },
          locale
        ),
      })}
    />
  )
}
