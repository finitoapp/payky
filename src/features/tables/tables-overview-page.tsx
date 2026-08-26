import { Link } from "@tanstack/react-router"
import { Table2 } from "lucide-react"
import { type ReactNode, useMemo } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card } from "@/components/ui/card.tsx"
import type { BillRow } from "@/core/modules/bill/bill.ts"
import { openBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import type { TableRow } from "@/core/modules/table/table.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

export function TablesOverviewPage() {
  const { t } = useTranslation()
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: openBills } = useEvoluQuery(openBillsQuery)

  const billsByTableId = useMemo(() => {
    const map = new Map<TableId, ReadonlyArray<BillRow>>()
    for (const bill of openBills) {
      if (bill.tableId === null) continue
      map.set(bill.tableId, [...(map.get(bill.tableId) ?? []), bill])
    }
    return map
  }, [openBills])

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("tables.title")} />

      {tables.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold">{t("tables.empty.title")}</p>
          <p className="max-w-72 text-balance text-sm text-muted-foreground">
            {t("tables.empty.description")}
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/settings/tables/new" />}
          >
            {t("settings.tables.add")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 pb-4">
          {tables.map((table) => (
            <TableTile
              key={table.id}
              table={table}
              bills={billsByTableId.get(table.id) ?? []}
            />
          ))}
        </div>
      )}
    </>
  )
}

function TableTile({
  table,
  bills,
}: {
  readonly table: TableRow
  readonly bills: ReadonlyArray<BillRow>
}) {
  const { t } = useTranslation()

  if (bills.length === 0) {
    return (
      <Link to="/bill" search={{ tableId: table.id }} className="block">
        <TableTileShell table={table} occupied={false}>
          <p className="text-sm text-muted-foreground">
            {t("tables.tile.free")}
          </p>
        </TableTileShell>
      </Link>
    )
  }

  if (bills.length === 1) {
    const [bill] = bills
    if (bill === undefined) return null

    return (
      <Link to="/bill" search={{ billId: bill.id }} className="block">
        <TableTileShell table={table} occupied>
          <OccupiedTableSummary bill={bill} />
        </TableTileShell>
      </Link>
    )
  }

  return (
    <Link to="/bill/list" search={{ tableId: table.id }} className="block">
      <TableTileShell table={table} occupied>
        <p className="text-sm text-primary-foreground/80">
          {t("tables.tile.multipleBills", { value: bills.length })}
        </p>
      </TableTileShell>
    </Link>
  )
}

function OccupiedTableSummary({ bill }: { readonly bill: BillRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const summaries = useBillLineSummaries(bill.id)
  const totalAmount = NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )
  const itemCount = summaries.reduce(
    (sum, summary) => sum + summary.quantity,
    0
  )

  return (
    <div className="flex flex-col gap-0.5 text-primary-foreground/80">
      <p className="text-sm">{t("bill.itemsCount", { value: itemCount })}</p>
      <p className="text-sm font-semibold text-primary-foreground">
        {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
      </p>
    </div>
  )
}

function TableTileShell({
  table,
  occupied,
  children,
}: {
  readonly table: TableRow
  readonly occupied: boolean
  readonly children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Card
      className={cn(
        "gap-3 p-4",
        occupied && "bg-primary text-primary-foreground"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{table.name}</p>
          <p
            className={cn(
              "text-sm text-muted-foreground",
              occupied && "text-primary-foreground/80"
            )}
          >
            {t("tables.seatCount", { value: table.seatCount })}
          </p>
        </div>
        <Table2
          className={cn(
            "size-5 shrink-0 text-muted-foreground",
            occupied && "text-primary-foreground/80"
          )}
        />
      </div>
      {children}
    </Card>
  )
}
