import { useTimestamp } from "@dedalik/use-react"
import {
  type OpenBillRow,
  openBillsQuery,
} from "@payky/core/modules/bill/bill-queries"
import { createRandomBillId } from "@payky/core/modules/bill/bill-types"
import {
  claimedPaymentIdSet,
  derivePendingPaymentIds,
} from "@payky/core/modules/bill/bill-utils"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@payky/core/modules/bill-line/bill-line-utils"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import type { TableRow } from "@payky/core/modules/table/table"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import type { TableId } from "@payky/core/modules/table/table-types"
import { Link } from "@tanstack/react-router"
import { PlusIcon, UsersIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { z } from "zod"
import { buttonVariants } from "@/components/ui/button.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { TableTileShell } from "@/features/shared/table-tile.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatElapsed, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

interface BillWithStats {
  readonly bill: OpenBillRow
  readonly stats: ReturnType<typeof deriveBillSummaryStats>
}

const TABLE_FILTER_STORAGE_KEY = "payky.posTableFilter"
const TableFilterSchema = z.enum(["all", "occupied", "free"])
type TableFilter = z.output<typeof TableFilterSchema>

const tableFilterLabelKeys = {
  all: "home.pos.filter.all",
  occupied: "home.pos.filter.occupied",
  free: "home.pos.filter.free",
} as const satisfies Record<TableFilter, TranslationKey>

/** Past these a bill reads as forgotten: first a warning, then an alarm. */
const LONG_OPEN_MS = 2 * 60 * 60_000
const VERY_LONG_OPEN_MS = 12 * 60 * 60_000

const elapsedClassName = (elapsedMs: number) =>
  elapsedMs >= VERY_LONG_OPEN_MS
    ? "rounded-sm bg-destructive/10 px-1 font-semibold text-destructive"
    : elapsedMs >= LONG_OPEN_MS
      ? "rounded-sm bg-warning/10 px-1 font-semibold text-warning"
      : "text-muted-foreground"

/**
 * The POS home screen, laid out as tills usually do: a strip of floor
 * stats with a free/occupied filter, a "no table" strip that starts a quick
 * bill and lists the open bills on no table, and below it one tile per
 * table. The strip sits above the grid rather than as its last tile because
 * a quick bill is a till's everyday action, not the exception.
 */
export function PosOverviewPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: openBills } = useEvoluQuery(openBillsQuery)
  const [tableFilter, setTableFilter] = useLocalStorageState(
    TABLE_FILTER_STORAGE_KEY,
    "all",
    TableFilterSchema
  )
  // ponytail: 30 s tick, so an expired invoice's "paying" state can outlive
  // `expiresAt` by up to that — use `useNow(expiresAt)` if it ever matters.
  const now = useTimestamp({ interval: 30_000 })
  // Derived from the rows' embedded `lines`/`items`, not a per-bill query:
  // a query per bill meant the floor view opened two more for every bill on
  // screen. Newest first, in every tile.
  const rows = useMemo(
    () =>
      openBills
        .map((bill) => ({
          bill,
          stats: deriveBillSummaryStats(
            calculateBillLineSummaries(bill.lines, bill.items)
          ),
        }))
        .sort((a, b) => b.bill.displayNumber - a.bill.displayNumber),
    [openBills]
  )
  const rowsByTableId = useMemo(() => {
    const map = new Map<TableId | null, ReadonlyArray<BillWithStats>>()
    for (const row of rows) {
      map.set(row.bill.tableId, [...(map.get(row.bill.tableId) ?? []), row])
    }
    return map
  }, [rows])

  const tableTiles = tables.map((table) => ({
    table,
    rows: rowsByTableId.get(table.id) ?? [],
  }))
  const occupiedCount = tableTiles.filter((tile) => tile.rows.length > 0).length
  const visibleTiles = tableTiles.filter(
    (tile) =>
      tableFilter === "all" ||
      (tableFilter === "occupied") === tile.rows.length > 0
  )
  const floorTotal = formatRowsTotal(rows, locale)

  return (
    <div className="mt-4 flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <dl className="flex gap-6">
          {tables.length > 0 && (
            <FloorStat
              label={t("home.pos.stats.tables")}
              value={`${occupiedCount} / ${tables.length}`}
            />
          )}
          <FloorStat label={t("home.pos.stats.bills")} value={rows.length} />
          {floorTotal !== undefined && (
            <FloorStat label={t("home.pos.stats.total")} value={floorTotal} />
          )}
        </dl>
        {tables.length > 0 && (
          <ToggleGroup<TableFilter>
            value={[tableFilter]}
            onValueChange={(nextValue) => {
              const [next] = nextValue
              if (next !== undefined) setTableFilter(next)
            }}
            variant="outline"
          >
            {TableFilterSchema.options.map((filter) => (
              <ToggleGroupItem
                key={filter}
                value={filter}
                className="h-10 px-4"
              >
                {t(tableFilterLabelKeys[filter])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      <NoTableStrip rows={rowsByTableId.get(null) ?? []} now={now} />
      {visibleTiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
          {visibleTiles.map((tile) => (
            <TableTile
              key={tile.table.id}
              table={tile.table}
              rows={tile.rows}
              now={now}
            />
          ))}
        </div>
      ) : (
        tables.length > 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {t(
              tableFilter === "free"
                ? "home.pos.noneFree"
                : "home.pos.noneOccupied"
            )}
          </p>
        )
      )}
      {tables.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          {t("home.pos.noTables")}{" "}
          <Link
            to="/settings/tables"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t("home.pos.addTables")}
          </Link>
        </p>
      )}
    </div>
  )
}

function FloorStat({
  label,
  value,
}: {
  readonly label: string
  readonly value: ReactNode
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * The summed total of `rows`, formatted — or `undefined` when they are in
 * more than one currency, which have no meaningful sum.
 */
const formatRowsTotal = (
  rows: ReadonlyArray<BillWithStats>,
  locale: string
): string | undefined => {
  const [first] = rows
  if (
    first === undefined ||
    rows.some(({ bill }) => bill.currency !== first.bill.currency)
  ) {
    return undefined
  }

  return formatMoney(
    {
      value: NonNegativeInteger(
        rows.reduce((sum, { stats }) => sum + stats.totalAmount, 0)
      ),
      currency: first.bill.currency,
    },
    locale
  )
}

/** Where a bill's payment stands, when it is anywhere at all. */
const billPaymentState = (
  bill: OpenBillRow,
  now: number
): "paymentPending" | "partiallyPaid" | undefined => {
  if (
    derivePendingPaymentIds(
      bill.payments,
      claimedPaymentIdSet(bill.claims),
      new Date(now)
    ).length > 0
  ) {
    return "paymentPending"
  }
  // Still open with a claim behind it: some money is in, not all of it.
  return bill.claims.length > 0 ? "partiallyPaid" : undefined
}

/** Covers the whole tile, so its most likely next step needs no aiming. */
const stretchedLinkClassName =
  "absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The open bills on no table and the quick bill that starts another. Always
 * shown, empty or not, so the quick bill is always one tap away.
 */
function NoTableStrip({
  rows,
  now,
}: {
  readonly rows: ReadonlyArray<BillWithStats>
  readonly now: number
}) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="no-table-tile"
      className="flex items-center gap-3 rounded-xl bg-card p-2 pl-4 ring-1 ring-foreground/10 ring-inset"
    >
      <p className="shrink-0 text-sm font-semibold">
        {t("bill.table.dialog.none")}
      </p>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {rows.length > 0 ? (
          rows.map((row) => <BillChip key={row.bill.id} {...row} now={now} />)
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            {t("home.pos.noTable.empty")}
          </p>
        )}
      </div>
      <NewBillLink
        tableId={undefined}
        aria-label={t("tables.tile.newBill")}
        className={cn(buttonVariants({ size: "lg" }), "h-11 shrink-0")}
      >
        <PlusIcon data-icon="inline-start" />
        {t("tables.tile.newBill")}
      </NewBillLink>
    </div>
  )
}

/**
 * One table. Tiles share a minimum height so the floor reads as a grid:
 * the table's name, then — on an occupied one — its running total large in
 * the corner, with how long it has been open (flagged once that is long),
 * the pieces on it and where its payment stands. A free tile starts a bill
 * anywhere it is tapped and a tile with exactly one bill opens it; with two
 * or more, each bill is a chip of its own. The "+" for another bill on the
 * same table (a split check) sits in the corner above the tile-wide link.
 */
function TableTile({
  table,
  rows,
  now,
}: {
  readonly table: TableRow
  readonly rows: ReadonlyArray<BillWithStats>
  readonly now: number
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const occupied = rows.length > 0
  const onlyBill = rows.length === 1 ? rows[0]?.bill : undefined
  const total = formatRowsTotal(rows, locale)
  const openedAt = Math.min(
    ...rows.map(({ bill }) => new Date(bill.createdAt).getTime())
  )
  const itemCount = rows.reduce((sum, { stats }) => sum + stats.itemCount, 0)
  const paymentStates = rows.map(({ bill }) => billPaymentState(bill, now))
  const paymentState = paymentStates.includes("paymentPending")
    ? "paymentPending"
    : paymentStates.includes("partiallyPaid")
      ? "partiallyPaid"
      : undefined

  return (
    <div data-testid="table-tile" className="relative h-full">
      <TableTileShell
        name={table.name}
        occupied={occupied}
        attention={paymentState !== undefined}
        // A minimum, not a fixed height: a row grows together, as a grid
        // row stretches its tiles, when one of them lists several bills.
        className="min-h-36 justify-between gap-2"
        icon={
          occupied ? (
            <NewBillLink
              tableId={table.id}
              aria-label={t("tables.tile.newBill")}
              className="relative z-10 -m-1.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-background/60 transition-colors hover:bg-background"
            >
              <PlusIcon className="size-4" />
            </NewBillLink>
          ) : (
            <PlusIcon className="size-5 shrink-0 text-muted-foreground" />
          )
        }
      >
        {rows.length > 1 && (
          <div className="relative z-10 flex gap-1.5 overflow-x-auto">
            {rows.map((row) => (
              <BillChip
                key={row.bill.id}
                {...row}
                now={now}
                showElapsed={false}
              />
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          {total !== undefined && (
            <p className="truncate text-xl font-bold tabular-nums">{total}</p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-muted-foreground">
            {occupied ? (
              <>
                <span className={elapsedClassName(now - openedAt)}>
                  {formatElapsed(now - openedAt, locale)}
                </span>
                <span>{t("tables.tile.itemCount", { value: itemCount })}</span>
                {paymentState !== undefined && (
                  <span className="rounded-sm bg-info/15 px-1 text-xs font-semibold text-info">
                    {t(`tables.tile.${paymentState}`)}
                  </span>
                )}
              </>
            ) : (
              <>
                <span>{t("tables.tile.free")}</span>
                <span className="flex items-center gap-0.5">
                  <UsersIcon aria-hidden className="size-3.5" />
                  <span aria-hidden>{table.seatCount}</span>
                  <span className="sr-only">
                    {t("tables.seatCount", { value: table.seatCount })}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </TableTileShell>
      {!occupied && (
        <NewBillLink
          tableId={table.id}
          aria-label={t("tables.tile.newBill")}
          className={stretchedLinkClassName}
        />
      )}
      {onlyBill !== undefined && (
        <Link
          to="/bill"
          search={{ billId: onlyBill.id }}
          aria-label={billLabel(onlyBill, t)}
          className={stretchedLinkClassName}
        />
      )}
    </div>
  )
}

function NewBillLink({
  tableId,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  readonly tableId: TableId | undefined
  readonly className: string
  readonly children?: ReactNode
  readonly "aria-label": string
}) {
  // Generated once per mount, put in the link's href up front so `/bill`'s
  // URL is already stable before the first tap — no post-tap redirect once
  // the bill row is lazily created (see `bill-page.tsx`, `use-cart-bill.ts`).
  const [billId] = useState(createRandomBillId)

  return (
    <Link
      to="/bill"
      search={tableId === undefined ? { billId } : { billId, tableId }}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </Link>
  )
}

const billLabel = (
  bill: OpenBillRow,
  t: ReturnType<typeof useTranslation>["t"]
) => bill.label ?? t("bill.list.label", { number: bill.displayNumber })

/**
 * One open bill as a chip, where a table holds several or the bill is on
 * no table: its total and, off a table, how long it has been open, a dot while its
 * payment is under way, and its label when it has one.
 */
function BillChip({
  bill,
  stats,
  now,
  showElapsed = true,
}: BillWithStats & {
  readonly now: number
  /** Off on a table tile, whose footer already says how long it is open. */
  readonly showElapsed?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const elapsedMs = now - new Date(bill.createdAt).getTime()
  const paymentState = billPaymentState(bill, now)

  return (
    <Link
      to="/bill"
      search={{ billId: bill.id }}
      aria-label={billLabel(bill, t)}
      className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-background/70 px-2.5 text-sm ring-1 ring-foreground/10 ring-inset transition-colors hover:bg-background"
    >
      {paymentState !== undefined && (
        <span
          aria-hidden
          title={t(`tables.tile.${paymentState}`)}
          className="size-2 rounded-full bg-info"
        />
      )}
      {bill.label !== null && (
        <span className="max-w-24 truncate text-muted-foreground">
          {bill.label}
        </span>
      )}
      <span className="font-semibold tabular-nums">
        {formatMoney(
          { value: stats.totalAmount, currency: bill.currency },
          locale
        )}
      </span>
      {showElapsed && (
        <span
          className={cn("text-xs tabular-nums", elapsedClassName(elapsedMs))}
        >
          {formatElapsed(elapsedMs, locale)}
        </span>
      )}
    </Link>
  )
}
