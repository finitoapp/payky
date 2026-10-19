import {
  tablesExistQuery,
  tablesPageQuery,
} from "@payky/core/modules/table/table-queries"
import Table2 from "lucide-react-native/icons/table-2"
import { Suspense, useCallback, useState } from "react"
import { YStack } from "tamagui"
import { ListSkeleton } from "../../../components/list-skeleton.tsx"
import { SearchInput } from "../../../components/search-input.tsx"
import { useDebouncedValue } from "../../../hooks/use-debounced-value.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import {
  SettingsEntityList,
  SettingsListShell,
} from "../settings-list-parts.tsx"

/** Tables, as web's `TablesSettingsPage`. */
export function TablesSettingsPage() {
  const { t } = useTranslation()
  return (
    <SettingsListShell
      title={t("settings.tables.title")}
      addLabel={t("settings.tables.add")}
      addHref="/settings/tables/new"
    >
      <TablesSettingsBody />
    </SettingsListShell>
  )
}

function TablesSettingsBody() {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const hasAny = useEvoluQuery(tablesExistQuery).data.length > 0

  return (
    <YStack flex={1} gap="3">
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
    </YStack>
  )
}

function TablesList({
  search,
  hasAny,
}: {
  readonly search: string
  readonly hasAny: boolean
}) {
  const { t } = useTranslation()
  const createPageQuery = useCallback(
    (limit: number) => tablesPageQuery({ search, limit }),
    [search]
  )

  return (
    <SettingsEntityList
      deps={[search]}
      createPageQuery={createPageQuery}
      icon={Table2}
      hasAny={hasAny}
      emptyTitle={t("settings.tables.empty.title")}
      emptyDescription={t("settings.tables.empty.description")}
      emptySearchLabel={t("settings.tables.emptySearch")}
      renderRow={(table) => ({
        id: table.id,
        title: table.name,
        href: `/settings/tables/${table.id}`,
        trailing: t("settings.tables.seatCount", { value: table.seatCount }),
      })}
    />
  )
}
