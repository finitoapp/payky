import { useTimestamp } from "@dedalik/use-react"
import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"

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
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { TableTileShell } from "@/features/tables/table-tile.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatElapsed, formatMoney } from "@/lib/format-utils.ts"
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
  const { t } = useTranslation()
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: openBills } = useEvoluQuery(openBillsQuery)

  const billsByTableId = useMemo(() => {
    const map = new Map<TableId, ReadonlyArray<OpenBillRow>>()
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
      <OverviewTile
        testId="no-table-tile"
        name={t("bill.table.dialog.none")}
        tableId={undefined}
        bills={unassignedBills}
      />
      {tables.map((table) => (
        <OverviewTile
          key={table.id}
          testId="table-tile"
          name={table.name}
          subtitle={t("tables.seatCount", { value: table.seatCount })}
          tableId={table.id}
          bills={billsByTableId.get(table.id) ?? []}
        />
      ))}
    </div>
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
 * sits above the tile-wide link.
 */
function OverviewTile({
  testId,
  name,
  subtitle,
  tableId,
  bills,
}: {
  readonly testId: string
  readonly name: string
  readonly subtitle?: string
  readonly tableId: TableId | undefined
  readonly bills: ReadonlyArray<OpenBillRow>
}) {
  const { t } = useTranslation()
  const occupied = bills.length > 0
  const onlyBill = bills.length === 1 ? bills[0] : undefined

  return (
    <div data-testid={testId} className="relative">
      <TableTileShell name={name} subtitle={subtitle} occupied={occupied}>
        <div className="flex flex-col gap-1.5">
          {!occupied && (
            <p className="text-sm text-muted-foreground">
              {t("tables.tile.free")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {bills.map((bill) => (
              <TileBillCard
                key={bill.id}
                bill={bill}
                linked={onlyBill === undefined}
              />
            ))}
            {occupied ? (
              <NewBillLink
                tableId={tableId}
                aria-label={t("tables.tile.newBill")}
                className="relative z-10 flex items-center justify-center rounded-lg bg-primary-foreground/15 px-3 py-2.5 text-primary-foreground transition-colors hover:bg-primary-foreground/25"
              >
                <PlusIcon className="size-4" />
              </NewBillLink>
            ) : (
              <span className="flex items-center justify-center rounded-lg bg-muted px-3 py-2.5 text-foreground">
                <PlusIcon className="size-4" />
              </span>
            )}
          </div>
        </div>
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
 * One open bill inside a tile, shown as its own small card (rather than a
 * full-width row or a single count) so each bill — including split checks
 * at the same table — can be jumped into directly, and several sit side
 * by side instead of always stacking one per line. `linked` is false when
 * the tile itself already links to this, its only bill.
 *
 * Also shows how long the bill has been open and whether a payment is in
 * flight or has partly landed, so staff can spot the table that is waiting.
 */
function TileBillCard({
  bill,
  linked,
}: {
  readonly bill: OpenBillRow
  readonly linked: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  // ponytail: 30 s tick, so an expired invoice's "paying" badge can outlive
  // `expiresAt` by up to that — use `useNow(expiresAt)` if it ever matters.
  const now = useTimestamp({ interval: 30_000 })
  // Derived from the row's embedded `lines`/`items`, not a per-bill query:
  // this card renders once per open bill, so a query here meant the floor
  // view opened two more for every bill on screen.
  const { totalAmount } = useMemo(
    () =>
      deriveBillSummaryStats(
        calculateBillLineSummaries(bill.lines, bill.items)
      ),
    [bill]
  )
  const hasPendingPayment =
    derivePendingPaymentIds(
      bill.payments,
      claimedPaymentIdSet(bill.claims),
      new Date(now)
    ).length > 0
  // Still open with a claim behind it: some money is in, not all of it.
  const isPartlyPaid = bill.claims.length > 0

  const className =
    "flex max-w-full flex-col items-start gap-0.5 rounded-lg bg-primary-foreground/15 px-2.5 py-2.5 text-primary-foreground"
  const content = (
    <>
      <span className="max-w-full truncate text-xs font-medium tracking-wide text-primary-foreground/75">
        {billLabel(bill, t)}
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
      </span>
      <span className="text-xs tabular-nums text-primary-foreground/75">
        {formatElapsed(now - new Date(bill.createdAt).getTime(), locale)}
      </span>
      {(hasPendingPayment || isPartlyPaid) && (
        <span className="mt-0.5 rounded-sm bg-primary-foreground px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary">
          {t(
            hasPendingPayment
              ? "tables.tile.paymentPending"
              : "tables.tile.partiallyPaid"
          )}
        </span>
      )}
    </>
  )

  if (!linked) return <div className={className}>{content}</div>

  return (
    <Link
      to="/bill"
      search={{ billId: bill.id }}
      aria-label={billLabel(bill, t)}
      className={cn(
        className,
        "transition-colors hover:bg-primary-foreground/25"
      )}
    >
      {content}
    </Link>
  )
}
