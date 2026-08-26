import { Link } from "@tanstack/react-router"
import { PlusIcon, Table2Icon } from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function TablesSettingsPage() {
  const { t } = useTranslation()
  const { data: tables } = useEvoluQuery(tablesQuery)

  return (
    <>
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

      <VerticalNav
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-lg font-semibold">
              {t("settings.tables.empty.title")}
            </p>
            <p className="text-balance text-sm text-muted-foreground">
              {t("settings.tables.empty.description")}
            </p>
          </div>
        }
        items={tables.map((table) => ({
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
        }))}
      />
    </>
  )
}
