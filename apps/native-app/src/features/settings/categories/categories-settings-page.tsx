import {
  catalogCategoriesExistQuery,
  catalogCategoriesPageQuery,
} from "@payky/core/modules/catalog-category/catalog-category-queries"
import { Suspense, useCallback, useState } from "react"
import { YStack } from "tamagui"
import { SearchInput } from "../../../components/search-input.tsx"
import { LoadingView } from "../../../components/state-views.tsx"
import { useDebouncedValue } from "../../../hooks/use-debounced-value.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import {
  SettingsEntityList,
  SettingsListShell,
} from "../settings-list-parts.tsx"

/** Catalog categories, as web's `CategoriesSettingsPage`. */
export function CategoriesSettingsPage() {
  const { t } = useTranslation()
  return (
    <SettingsListShell
      title={t("settings.categories.title")}
      addLabel={t("settings.categories.add")}
      addHref="/settings/categories/new"
    >
      <CategoriesSettingsBody />
    </SettingsListShell>
  )
}

function CategoriesSettingsBody() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const hasAny = useEvoluQuery(catalogCategoriesExistQuery).data.length > 0

  return (
    <YStack flex={1} gap="3">
      {hasAny && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.categories.search")}
          clearAriaLabel={t("settings.categories.search.clear.aria")}
        />
      )}
      <Suspense fallback={<LoadingView />}>
        <CategoriesList search={debouncedSearch} hasAny={hasAny} />
      </Suspense>
    </YStack>
  )
}

function CategoriesList({
  search,
  hasAny,
}: {
  readonly search: string
  readonly hasAny: boolean
}) {
  const { t } = useTranslation()
  const createPageQuery = useCallback(
    (limit: number) => catalogCategoriesPageQuery({ search, limit }),
    [search]
  )

  return (
    <SettingsEntityList
      deps={[search]}
      createPageQuery={createPageQuery}
      hasAny={hasAny}
      emptyTitle={t("settings.categories.empty.title")}
      emptyDescription={t("settings.categories.empty.description")}
      emptySearchLabel={t("settings.categories.emptySearch")}
      renderRow={(category) => ({
        id: category.id,
        title: category.name,
        href: `/settings/categories/${category.id}`,
      })}
    />
  )
}
