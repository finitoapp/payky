import { type ReactNode, Suspense, useState } from "react"

import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { catalogCategoriesExistQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import { CategoriesList } from "@/features/settings/categories/categories-list.tsx"
import { SettingsListPage } from "@/features/settings/settings-list-page.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CategoriesSettingsPage() {
  const { t } = useTranslation()

  return (
    <SettingsListPage
      title={t("settings.categories.title")}
      addAriaLabel={t("settings.categories.add")}
      addTo="/settings/categories/new"
    >
      <CategoriesSettingsBody />
    </SettingsListPage>
  )
}

function CategoriesSettingsBody() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)

  const searchInput = (
    <SearchInput
      value={search}
      onChange={setSearch}
      placeholder={t("settings.categories.search")}
      clearAriaLabel={t("settings.categories.search.clear.aria")}
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
      <CategoriesSettingsContent
        searchInput={searchInput}
        search={debouncedSearch}
      />
    </Suspense>
  )
}

function CategoriesSettingsContent({
  searchInput,
  search,
}: {
  readonly searchInput: ReactNode
  readonly search: string
}) {
  const { data: existRows } = useEvoluQuery(catalogCategoriesExistQuery)
  const hasAny = existRows.length > 0

  return (
    <>
      {hasAny && searchInput}

      <Suspense fallback={<ListSkeleton />}>
        <CategoriesList search={search} hasAny={hasAny} />
      </Suspense>
    </>
  )
}
