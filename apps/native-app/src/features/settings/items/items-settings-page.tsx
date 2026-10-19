import { formatMoney } from "@payky/app-shared/format-money"
import { catalogCategoriesQuery } from "@payky/core/modules/catalog-category/catalog-category-queries"
import {
  catalogItemsPageQuery,
  catalogItemsQuery,
  catalogItemUsedCategoryIdsQuery,
} from "@payky/core/modules/catalog-item/catalog-item-queries"
import type { CategoryFilter } from "@payky/core/modules/catalog-item/catalog-item-types"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@payky/core/modules/catalog-item/catalog-item-utils"
import { Integer } from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { Suspense, useCallback, useMemo, useState } from "react"
import { YStack } from "tamagui"
import { SearchInput } from "../../../components/search-input.tsx"
import { LoadingView } from "../../../components/state-views.tsx"
import { useDebouncedValue } from "../../../hooks/use-debounced-value.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../../hooks/use-hardware-scanner.ts"
import { useIsConfirmOpen } from "../../../hooks/use-is-confirm-open.ts"
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
  const confirmOpen = useIsConfirmOpen()
  const { data: allItems } = useEvoluQuery(catalogItemsQuery)

  // A scan opens the item it identifies, or a new one carrying the code.
  // Several matches (the code is not unique across devices) are left to the
  // list: searching for the code shows exactly them.
  useHardwareScanner({
    enabled: !confirmOpen,
    onScan: (code) => {
      const matches = findCatalogItemsByScanCode(allItems, code)
      const [match] = matches
      // A focused search field received the code's characters too.
      setSearch((current) =>
        current.endsWith(code) ? current.slice(0, -code.length) : current
      )
      if (matches.length > 1) setSearch(code)
      else if (match === undefined)
        router.push({ pathname: "/settings/items/new", params: { scan: code } })
      else
        router.push({
          pathname: "/settings/items/[catalogItemId]",
          params: { catalogItemId: match.id },
        })
    },
  })

  return (
    <YStack flex={1} gap="3">
      {hasAny && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.items.search")}
          clearAriaLabel={t("settings.items.search.clear.aria")}
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
