import { useMemo } from "react"
import { Card } from "@/components/ui/card.tsx"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { getLatestCatalogItemSummary } from "@/core/modules/bill-line/bill-line-utils.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { getStaffDisplayName } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import type { PositiveNumber } from "@/core/modules/shared/schema.ts"
import { ItemQuantityControls } from "@/features/bill/item-quantity-controls.tsx"
import { ScanCodeScanner } from "@/features/scanner/scan-code-scanner.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Replaces the item grid on `/bill` while scan mode is on: a live camera
 * scanner on top, and a panel below showing only the most recently scanned
 * item (its running quantity in the cart plus the usual +/- controls) — the
 * full cart contents stay in the bottom summary, same as in the regular
 * grid view. What a scan does, and its dialogs, live in
 * `useBillScanHandler`, which the hardware scanner shares.
 */
export function BillScanView({
  lastScanned,
  paused,
  summaries,
  locale,
  onScan,
  onAdd,
  onAddQuantity,
  onRemove,
}: {
  readonly lastScanned: CatalogItemRow | null
  readonly paused: boolean
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly locale: string
  readonly onScan: (rawValue: string) => void
  readonly onAdd: (catalogItem: CatalogItemRow) => void
  readonly onAddQuantity: (
    catalogItem: CatalogItemRow,
    quantity: PositiveNumber
  ) => void
  readonly onRemove: (summary: BillLineSummary) => void
}) {
  const { t } = useTranslation()

  const matchingSummaries = useMemo(
    () =>
      lastScanned === null
        ? []
        : summaries.filter(
            (summary) => summary.catalogItemId === lastScanned.id
          ),
    [summaries, lastScanned]
  )
  const quantity = matchingSummaries.reduce(
    (sum, summary) => sum + summary.quantity,
    0
  )
  const latestSummary =
    lastScanned === null
      ? undefined
      : getLatestCatalogItemSummary(matchingSummaries, lastScanned.id)

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-96 shrink-0 overflow-hidden rounded-lg bg-black sm:h-[28rem]">
        <ScanCodeScanner onScan={onScan} paused={paused} />
      </div>

      <div className="mt-2 flex-1 overflow-y-auto pb-4">
        {lastScanned === null ? (
          <p className="mt-10 text-center text-muted-foreground">
            {t("bill.scan.lastScanned.empty")}
          </p>
        ) : (
          <Card
            className={cn(
              "gap-3 p-3",
              quantity > 0 && "bg-primary text-primary-foreground"
            )}
          >
            <div className="min-w-0">
              <p className="font-medium">{getStaffDisplayName(lastScanned)}</p>
              <p
                className={cn(
                  "text-sm text-muted-foreground",
                  quantity > 0 && "text-primary-foreground/80"
                )}
              >
                {formatMoney(
                  {
                    value: lastScanned.unitAmount,
                    currency: lastScanned.currency,
                  },
                  locale
                )}
              </p>
            </div>
            <ItemQuantityControls
              name={getStaffDisplayName(lastScanned)}
              quantity={quantity}
              inCart={quantity > 0}
              onAdd={() => onAdd(lastScanned)}
              onAddQuantity={(nextQuantity) =>
                onAddQuantity(lastScanned, nextQuantity)
              }
              onRemove={() => {
                if (latestSummary === undefined) return
                onRemove(latestSummary)
              }}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
