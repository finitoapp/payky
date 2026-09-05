import { useCallback, useMemo, useState } from "react"

import { ScanCodeScanner } from "@/components/scan-code-scanner.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { Card } from "@/components/ui/card.tsx"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { CatalogCategoryRow } from "@/core/modules/catalog-category/catalog-category.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import type {
  FiatCurrency as FiatCurrencyType,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { getLatestCatalogItemSummary } from "@/features/bill/cart-utils.ts"
import { CreateCatalogItemDialog } from "@/features/bill/create-catalog-item-dialog.tsx"
import { ItemQuantityControls } from "@/features/bill/item-quantity-controls.tsx"
import { ScanCodeCollisionDialog } from "@/features/bill/scan-code-collision-dialog.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Replaces the item grid on `/bill` while scan mode is on: a live camera
 * scanner on top, and a panel below showing only the most recently scanned
 * item (its running quantity in the cart plus the usual +/- controls) — the
 * full cart contents stay in the bottom summary, same as in the regular
 * grid view.
 */
export function BillScanView({
  currencyItems,
  categories,
  currency,
  summaries,
  disabled,
  locale,
  onAdd,
  onAddQuantity,
  onRemove,
}: {
  readonly currencyItems: ReadonlyArray<CatalogItemRow>
  readonly categories: ReadonlyArray<CatalogCategoryRow>
  readonly currency: FiatCurrencyType
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly disabled: boolean
  readonly locale: string
  readonly onAdd: (catalogItem: CatalogItemRow) => void
  readonly onAddQuantity: (
    catalogItem: CatalogItemRow,
    quantity: PositiveNumber
  ) => void
  readonly onRemove: (summary: BillLineSummary) => void
}) {
  const { t } = useTranslation()
  const [lastScanned, setLastScanned] = useState<CatalogItemRow | null>(null)
  const [unknownCode, setUnknownCode] = useState<string | null>(null)
  const [collisionCandidates, setCollisionCandidates] = useState<
    ReadonlyArray<CatalogItemRow>
  >([])
  const [createDialogCode, setCreateDialogCode] = useState<string | null>(null)

  const handleScan = useCallback(
    (rawValue: string) => {
      const matches = findCatalogItemsByScanCode(currencyItems, rawValue)

      if (matches.length === 0) {
        setUnknownCode(rawValue)
        return
      }

      if (matches.length > 1) {
        setCollisionCandidates(matches)
        return
      }

      const [item] = matches
      if (item === undefined) return
      setLastScanned(item)
      onAdd(item)
    },
    [currencyItems, onAdd]
  )

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

  const dialogsOpen =
    unknownCode !== null ||
    collisionCandidates.length > 0 ||
    createDialogCode !== null

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-96 shrink-0 overflow-hidden rounded-lg bg-black sm:h-[28rem]">
        <ScanCodeScanner onScan={handleScan} paused={dialogsOpen} />
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
              disabled={disabled}
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

      <AlertDialog
        open={unknownCode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setUnknownCode(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bill.scan.unknown.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("bill.scan.unknown.description", {
                code: unknownCode ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("bill.scan.unknown.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unknownCode === null) return
                setCreateDialogCode(unknownCode)
              }}
            >
              {t("bill.scan.unknown.create")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScanCodeCollisionDialog
        open={collisionCandidates.length > 0}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCollisionCandidates([])
        }}
        candidates={collisionCandidates}
        onSelect={(item) => {
          setCollisionCandidates([])
          setLastScanned(item)
          onAdd(item)
        }}
      />

      <CreateCatalogItemDialog
        open={createDialogCode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCreateDialogCode(null)
        }}
        scanCode={createDialogCode ?? ""}
        currency={currency}
        categories={categories}
        onCreated={(item) => {
          setCreateDialogCode(null)
          setLastScanned(item)
          onAdd(item)
        }}
      />
    </div>
  )
}
