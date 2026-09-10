import { Table2Icon } from "lucide-react"
import { useCallback } from "react"

import { tablesPageQuery } from "@/core/modules/table/table-queries.ts"
import { SettingsEntityList } from "@/features/settings/settings-entity-list.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function TablesList({
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
      hasAny={hasAny}
      emptyTitle={t("settings.tables.empty.title")}
      emptyDescription={t("settings.tables.empty.description")}
      emptySearchLabel={t("settings.tables.emptySearch")}
      renderItem={(table) => ({
        id: table.id,
        kind: "link" as const,
        to: "/settings/tables/$tableId",
        params: { tableId: table.id },
        icon: <Table2Icon className="text-muted-foreground" />,
        label: table.name,
        action: (
          <span className="text-sm font-medium text-muted-foreground">
            {t("settings.tables.seatCount", { value: table.seatCount })}
          </span>
        ),
      })}
    />
  )
}
