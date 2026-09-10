import { Table2 } from "lucide-react"
import { type ReactNode, useMemo } from "react"

import { Card } from "@/components/ui/card.tsx"
import type { OpenBillRow } from "@/core/modules/bill/bill-queries.ts"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Visual shell shared by every tile in the tables overview grid (real
 * tables and the "no table" bucket alike) and the bill page's table
 * assignment picker, so all three show occupancy the same way. Takes a
 * plain name/subtitle rather than a `TableRow` so a non-table tile can
 * reuse it without faking a table row.
 */
export function TableTileShell({
  name,
  subtitle,
  occupied,
  selected,
  children,
}: {
  readonly name: string
  readonly subtitle?: ReactNode
  readonly occupied: boolean
  readonly selected?: boolean
  readonly children: ReactNode
}) {
  return (
    <Card
      className={cn(
        "gap-3 p-4",
        occupied && "bg-primary text-primary-foreground",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {subtitle !== undefined && (
            <p
              className={cn(
                "text-sm text-muted-foreground",
                occupied && "text-primary-foreground/80"
              )}
            >
              {subtitle}
            </p>
          )}
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

export function OccupiedTableSummary({ bill }: { readonly bill: OpenBillRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  // `lines`/`items` ride along on `openBillsQuery`, so a tile needs no query
  // of its own — a floor view of N open bills used to open 2N of them.
  const { itemCount, totalAmount } = useMemo(
    () =>
      deriveBillSummaryStats(
        calculateBillLineSummaries(bill.lines, bill.items)
      ),
    [bill]
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
