import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { Suspense, useState } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { Button } from "@/components/ui/button.tsx"
import { tablesExistQuery } from "@/core/modules/table/table-queries.ts"
import { TablesList } from "@/features/settings/tables/tables-list.tsx"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function TablesSettingsPage() {
  const { t } = useTranslation()

  return (
    <div className={"flex flex-col gap-2"}>
      <div className="h-6" />
      <FadeHeader
        title={t("settings.tables.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                aria-label={t("settings.tables.add")}
                to="/settings/tables/new"
              />
            }
          >
            <PlusIcon className="text-primary size-5" strokeWidth={3} />
          </Button>
        }
      />

      <Suspense fallback={<ListSkeleton />}>
        <TablesSettingsBody />
      </Suspense>
    </div>
  )
}

function TablesSettingsBody() {
  const { t } = useTranslation()
  const { data: existRows } = useEvoluQuery(tablesExistQuery)
  const hasAnyTables = existRows.length > 0

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)

  return (
    <>
      {hasAnyTables && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("settings.tables.search")}
          clearAriaLabel={t("settings.tables.search.clear.aria")}
        />
      )}

      <Suspense fallback={<ListSkeleton />}>
        <TablesList search={debouncedSearch} hasAnyTables={hasAnyTables} />
      </Suspense>
    </>
  )
}
