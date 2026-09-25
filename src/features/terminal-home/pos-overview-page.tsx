import { useTimestamp } from "@dedalik/use-react"
import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { z } from "zod"

import { Toggle } from "@/components/ui/toggle.tsx"

import {
  type OpenBillRow,
  openBillsQuery,
} from "@/core/modules/bill/bill-queries.ts"
import { createRandomBillId } from "@/core/modules/bill/bill-types.ts"
import {
  claimedPaymentIdSet,
  derivePendingPaymentIds,
} from "@/core/modules/bill/bill-utils.ts"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { TableTileShell } from "@/features/tables/table-tile.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatElapsed, formatMoney } from "@/lib/format-utils.ts"

interface BillWithStats {
  readonly bill: OpenBillRow
  readonly stats: ReturnType<typeof deriveBillSummaryStats>
}

const OCCUPIED_ONLY_STORAGE_KEY = "payky.posOccupiedOnly"
const OccupiedOnlySchema = z.boolean()

/**
 * Single overview grid for the POS home screen: one tile per real table,
 * followed by a permanent "no table" tile listing every open bill that isn't
 * on a table. The "no table" tile uses the exact same shell as a table tile
 * — it's always present (even with nothing in it) so it reads as part of the
 * grid rather than a special case, and doubles as the entry point for
 * starting a bill without a table. It comes last because in a venue with
 * tables it is the exception; without tables it is the only tile anyway.
 *
 * Above the grid, a summary of what is open across the floor and an
 * "occupied only" filter that hides free tiles on a large floor.
 */
export function PosOverviewPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: openBills } = useEvoluQuery(openBillsQuery)
  const [occupiedOnly, setOccupiedOnly] = useLocalStorageState(
    OCCUPIED_ONLY_STORAGE_KEY,
    false,
    OccupiedOnlySchema
  )

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

  const tiles = [
    ...tables.map((table) => ({
      key: table.id,
      testId: "table-tile",
      name: table.name,
      subtitle: t("tables.seatCount", { value: table.seatCount }),
      tableId: table.id,
      rows: rowsByTableId.get(table.id) ?? [],
    })),
    {
      key: "no-table",
      testId: "no-table-tile",
      name: t("bill.table.dialog.none"),
      subtitle: undefined,
      tableId: undefined,
      rows: rowsByTableId.get(null) ?? [],
    },
  ]
  const visibleTiles = occupiedOnly
    ? tiles.filter((tile) => tile.rows.length > 0)
    : tiles
  const floorTotal = formatRowsTotal(rows, locale)

  return (
    <div className="mt-4 flex flex-col gap-3 pb-4">
      {(rows.length > 0 || tables.length > 0) && (
        <div className="flex min-h-8 items-center justify-between gap-2 px-1">
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length > 0 &&
              (floorTotal === undefined
                ? t("home.pos.summaryCount", { count: rows.length })
                : t("home.pos.summary", {
                    count: rows.length,
                    total: floorTotal,
                  }))}
          </p>
          {tables.length > 0 && (
            <Toggle
              size="sm"
              variant="outline"
              pressed={occupiedOnly}
              onPressedChange={setOccupiedOnly}
            >
              {t("home.pos.occupiedOnly")}
            </Toggle>
          )}
        </div>
      )}
      {visibleTiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {visibleTiles.map(({ key, ...tile }) => (
            <OverviewTile key={key} {...tile} />
          ))}
        </div>
      ) : (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          {t("home.pos.noneOccupied")}
        </p>
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

/** Covers the whole tile, so its most likely next step needs no aiming. */
const stretchedLinkClassName =
  "absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * One tile of the grid — a real table, or the "no table" bucket with
 * `tableId` undefined. A free tile starts a bill anywhere it is tapped, and a
 * tile with exactly one bill opens it; only with two or more bills does the
 * tap have to pick one. The "+" stays for a second bill (a split check) and
 * sits above the tile-wide link. That link only widens the bill card's own
 * target, so it is hidden from assistive tech and focus instead of being a
 * second, empty link to the same bill.
 *
 * With two or more bills the subtitle swaps the seat count for the table's
 * running total — what staff look for once a table is seated.
 */
function OverviewTile({
  testId,
  name,
  subtitle,
  tableId,
  rows,
}: {
  readonly testId: string
  readonly name: string
  readonly subtitle: string | undefined
  readonly tableId: TableId | undefined
  readonly rows: ReadonlyArray<BillWithStats>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const occupied = rows.length > 0
  const onlyBill = rows.length === 1 ? rows[0]?.bill : undefined
  const tableTotal = rows.length > 1 ? formatRowsTotal(rows, locale) : undefined

  return (
    <div data-testid={testId} className="relative">
      <TableTileShell
        name={name}
        subtitle={tableTotal ?? subtitle}
        occupied={occupied}
        icon={
          occupied ? null : (
            <PlusIcon className="size-5 shrink-0 text-muted-foreground" />
          )
        }
      >
        {occupied ? (
          <div className="flex flex-wrap gap-1.5">
            {rows.map(({ bill, stats }) => (
              <TileBillCard key={bill.id} bill={bill} stats={stats} />
            ))}
            <NewBillLink
              tableId={tableId}
              aria-label={t("tables.tile.newBill")}
              className="relative z-10 flex items-center justify-center rounded-lg bg-primary/20 px-3 py-2.5 transition-colors hover:bg-primary/30"
            >
              <PlusIcon className="size-4" />
            </NewBillLink>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("tables.tile.free")}
          </p>
        )}
      </TableTileShell>
      {!occupied && (
        <NewBillLink
          tableId={tableId}
          aria-label={t("tables.tile.newBill")}
          className={stretchedLinkClassName}
        />
      )}
      {onlyBill !== undefined && (
        <Link
          to="/bill"
          search={{ billId: onlyBill.id }}
          aria-hidden
          tabIndex={-1}
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
 * One open bill inside a tile, shown as its own small card (rather than a
 * full-width row or a single count) so each bill — including split checks
 * at the same table — can be jumped into directly, and several sit side
 * by side instead of always stacking one per line.
 *
 * Also shows how long the bill has been open and whether a payment is in
 * flight or has partly landed, so staff can spot the table that is waiting.
 * That badge is the one solid accent on the floor view, on purpose.
 */
function TileBillCard({
  bill,
  stats,
}: {
  readonly bill: OpenBillRow
  readonly stats: ReturnType<typeof deriveBillSummaryStats>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  // ponytail: 30 s tick, so an expired invoice's "paying" badge can outlive
  // `expiresAt` by up to that — use `useNow(expiresAt)` if it ever matters.
  const now = useTimestamp({ interval: 30_000 })
  const hasPendingPayment =
    derivePendingPaymentIds(
      bill.payments,
      claimedPaymentIdSet(bill.claims),
      new Date(now)
    ).length > 0
  // Still open with a claim behind it: some money is in, not all of it.
  const isPartlyPaid = bill.claims.length > 0

  return (
    <Link
      to="/bill"
      search={{ billId: bill.id }}
      aria-label={billLabel(bill, t)}
      className="relative z-10 flex max-w-full flex-col items-start gap-0.5 rounded-lg bg-primary/20 px-2.5 py-2.5 transition-colors hover:bg-primary/30"
    >
      <span className="max-w-full truncate text-xs font-medium tracking-wide text-muted-foreground">
        {bill.label ??
          t("tables.tile.billNumber", { number: bill.displayNumber })}
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {formatMoney(
          { value: stats.totalAmount, currency: bill.currency },
          locale
        )}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {t("tables.tile.itemCount", { value: stats.itemCount })}
        {" · "}
        {formatElapsed(now - new Date(bill.createdAt).getTime(), locale)}
      </span>
      {(hasPendingPayment || isPartlyPaid) && (
        <span className="mt-0.5 rounded-sm bg-primary px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary-foreground">
          {t(
            hasPendingPayment
              ? "tables.tile.paymentPending"
              : "tables.tile.partiallyPaid"
          )}
        </span>
      )}
    </Link>
  )
}
