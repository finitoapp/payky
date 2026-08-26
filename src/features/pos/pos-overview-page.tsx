import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useMemo } from "react"

import type { BillRow } from "@/core/modules/bill/bill.ts"
import { openBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import type { TableRow } from "@/core/modules/table/table.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { TableTileShell } from "@/features/tables/table-tile.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Single overview grid for the POS home screen: a permanent "no table"
 * tile listing every open bill that isn't on a table, followed by one
 * tile per real table. The "no table" tile uses the exact same shell as a
 * table tile — it's always present (even with nothing in it) so it reads
 * as part of the grid rather than a special case, and doubles as the
 * always-available entry point for starting a bill without a table.
 */
export function PosOverviewPage() {
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: openBills } = useEvoluQuery(openBillsQuery)

  const billsByTableId = useMemo(() => {
    const map = new Map<TableId, ReadonlyArray<BillRow>>()
    for (const bill of openBills) {
      if (bill.tableId === null) continue
      map.set(bill.tableId, [...(map.get(bill.tableId) ?? []), bill])
    }
    // Newest first, matching the "no table" tile's own ordering.
    for (const [tableId, bills] of map) {
      map.set(
        tableId,
        [...bills].sort((a, b) => b.displayNumber - a.displayNumber)
      )
    }
    return map
  }, [openBills])

  const unassignedBills = useMemo(
    () =>
      openBills
        .filter((bill) => bill.tableId === null)
        .sort((a, b) => b.displayNumber - a.displayNumber),
    [openBills]
  )

  return (
    <div className="mt-4 grid grid-cols-2 items-start gap-2 pb-4">
      <NoTableTile bills={unassignedBills} />
      {tables.map((table) => (
        <TableTile
          key={table.id}
          table={table}
          bills={billsByTableId.get(table.id) ?? []}
        />
      ))}
    </div>
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
  const occupied = bills.length > 0

  return (
    <div data-testid="table-tile">
      <TableTileShell
        name={table.name}
        subtitle={t("tables.seatCount", { value: table.seatCount })}
        occupied={occupied}
      >
        <div className="flex flex-col gap-1.5">
          {!occupied && (
            <p className="text-sm text-muted-foreground">
              {t("tables.tile.free")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {bills.map((bill) => (
              <TileBillCard key={bill.id} bill={bill} />
            ))}
            <NewBillLink tableId={table.id} occupied={occupied} />
          </div>
        </div>
      </TableTileShell>
    </div>
  )
}

/**
 * Bucket for every open bill without a table, shown as a tile identical in
 * shape to a real table tile so it fits visually into the same grid.
 */
function NoTableTile({ bills }: { readonly bills: ReadonlyArray<BillRow> }) {
  const { t } = useTranslation()
  const occupied = bills.length > 0

  return (
    <div data-testid="no-table-tile">
      <TableTileShell name={t("bill.table.dialog.none")} occupied={occupied}>
        <div className="flex flex-col gap-1.5">
          {!occupied && (
            <p className="text-sm text-muted-foreground">
              {t("tables.tile.free")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {bills.map((bill) => (
              <TileBillCard key={bill.id} bill={bill} />
            ))}
            <NewBillLink tableId={undefined} occupied={occupied} />
          </div>
        </div>
      </TableTileShell>
    </div>
  )
}

function NewBillLink({
  tableId,
  occupied,
}: {
  readonly tableId: TableId | undefined
  readonly occupied: boolean
}) {
  const { t } = useTranslation()

  return (
    <Link
      to="/bill"
      search={tableId === undefined ? {} : { tableId }}
      aria-label={t("tables.tile.newBill")}
      className={cn(
        "flex items-center justify-center rounded-lg px-3 py-2.5 transition-colors",
        occupied
          ? "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
          : "bg-muted text-foreground hover:bg-muted/70"
      )}
    >
      <PlusIcon className="size-4" />
    </Link>
  )
}

/**
 * One open bill inside a tile, shown as its own small card (rather than a
 * full-width row or a single count) so each bill — including split checks
 * at the same table — can be jumped into directly, and several sit side
 * by side instead of always stacking one per line.
 */
function TileBillCard({ bill }: { readonly bill: BillRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const summaries = useBillLineSummaries(bill.id)
  const totalAmount = NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )
  const label =
    bill.label ?? t("bill.list.label", { number: bill.displayNumber })

  return (
    <Link
      to="/bill"
      search={{ billId: bill.id }}
      aria-label={label}
      className="flex max-w-full flex-col items-start gap-0.5 rounded-lg bg-primary-foreground/15 px-2.5 py-2.5 text-primary-foreground transition-colors hover:bg-primary-foreground/25"
    >
      <span className="max-w-full truncate text-xs font-medium tracking-wide text-primary-foreground/75">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
      </span>
    </Link>
  )
}
