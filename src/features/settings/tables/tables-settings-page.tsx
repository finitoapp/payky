import { Suspense, useState } from "react"

import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { tablesExistQuery } from "@/core/modules/table/table-queries.ts"
import { SettingsListPage } from "@/features/settings/settings-list-page.tsx"
import { TablesList } from "@/features/settings/tables/tables-list.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function TablesSettingsPage() {
  const { t } = useTranslation()

  return (
    <SettingsListPage
      title={t("settings.tables.title")}
      addAriaLabel={t("settings.tables.add")}
      addTo="/settings/tables/new"
    >
      <TablesSettingsBody />
    </SettingsListPage>
  )
}

function TablesSettingsBody() {
  const { t } = useTranslation()
  const { data: existRows } = useEvoluQuery(tablesExistQuery)
  const hasAny = existRows.length > 0

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)

  return (
    <>
      {hasAny && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.tables.search")}
          clearAriaLabel={t("settings.tables.search.clear.aria")}
        />
      )}

      <Suspense fallback={<ListSkeleton />}>
        <TablesList search={debouncedSearch} hasAny={hasAny} />
      </Suspense>
    </>
  )
}
