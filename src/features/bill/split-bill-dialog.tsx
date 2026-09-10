import { MinusIcon, PlusIcon } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  type OpenBillRow,
  openBillsQuery,
} from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import {
  type FiatCurrency,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { vibrateOnButtonPress } from "@/core/native/haptics.ts"
import { getBillLineSummaryUnitAmount } from "@/features/bill/cart-utils.ts"
import { useChangePulse } from "@/hooks/use-change-pulse.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/** How many units of each line, keyed by `BillLineSummary["id"]`, are picked to move. */
type SplitSelection = Readonly<Record<string, number>>

type SplitDestination = "new" | "existing"

export type SplitBillConfirmInput =
  | {
      readonly destination: "new"
      readonly items: ReadonlyArray<BillLineSummary>
    }
  | {
      readonly destination: "existing"
      readonly targetBillId: BillId
      readonly items: ReadonlyArray<BillLineSummary>
    }

/**
 * The `/bill` page's "split bill" entry point: lets staff pick how many
 * units of each line item move either to a brand-new bill or to another
 * already-open one, then hands the picked items (with quantity/totalAmount
 * already reduced to the moved portion) to `onConfirm` — the caller
 * composes those into `splitBillIntoNewBill`/`splitBill`.
 *
 * Selection and destination are local dialog state, reset every time it
 * opens, so a previous split's picks never leak into the next one.
 */
export function SplitBillDialog({
  open,
  onOpenChange,
  billId,
  summaries,
  currency,
  pending,
  onConfirm,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** The current (source) bill — excluded from the "existing bill" picker. */
  readonly billId: BillId
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly currency: FiatCurrency
  readonly pending: boolean
  readonly onConfirm: (input: SplitBillConfirmInput) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [selected, setSelected] = useState<SplitSelection>({})
  const [destination, setDestination] = useState<SplitDestination>("new")
  const [targetBillId, setTargetBillId] = useState<BillId | null>(null)

  const { data: openBills } = useEvoluQuery(openBillsQuery)
  const { data: tables } = useEvoluQuery(tablesQuery)
  // Only bills in the same currency are offered: a bill's line items are
  // always priced in its own `currency`, and mixing two into one total
  // would misrender every amount on the merged bill.
  const otherOpenBills = useMemo(
    () =>
      openBills.filter(
        (candidate) =>
          candidate.id !== billId && candidate.currency === currency
      ),
    [openBills, billId, currency]
  )

  useEffect(() => {
    if (!open) return
    setSelected({})
    setDestination("new")
    setTargetBillId(null)
  }, [open])

  const setQuantity = (summary: BillLineSummary, quantity: number) => {
    setSelected((current) => ({
      ...current,
      [summary.id]: Math.min(Math.max(quantity, 0), summary.quantity),
    }))
  }

  const selectAll = () => {
    setSelected(
      Object.fromEntries(
        summaries.map((summary) => [summary.id, summary.quantity])
      )
    )
  }
  const clearSelection = () => setSelected({})

  const items = useMemo(
    () =>
      summaries.flatMap((summary): BillLineSummary[] => {
        const quantity = selected[summary.id] ?? 0
        if (quantity <= 0) return []

        const unitAmount = getBillLineSummaryUnitAmount(summary)
        return [
          {
            ...summary,
            quantity: PositiveNumber(quantity),
            totalAmount: NonNegativeInteger(unitAmount * quantity),
          },
        ]
      }),
    [summaries, selected]
  )
  const { itemCount: totalQuantity, totalAmount } =
    deriveBillSummaryStats(items)
  const totalQuantityPulseControls = useChangePulse(totalQuantity)
  const totalAmountPulseControls = useChangePulse(totalAmount)

  const canConfirm =
    items.length > 0 &&
    !pending &&
    (destination === "new" || targetBillId !== null)

  const handleConfirm = () => {
    if (destination === "new") {
      onConfirm({ destination: "new", items })
      return
    }
    if (targetBillId === null) return
    onConfirm({ destination: "existing", targetBillId, items })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{t("bill.split.title")}</DialogTitle>
          <DialogDescription>{t("bill.split.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <ToggleGroup<SplitDestination>
            value={[destination]}
            onValueChange={(next) => {
              const [nextDestination] = next
              if (nextDestination === undefined) return
              setDestination(nextDestination)
            }}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ToggleGroupItem value="new" className="flex-1">
              {t("bill.split.destination.new")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="existing"
              className="flex-1"
              disabled={otherOpenBills.length === 0}
            >
              {t("bill.split.destination.existing")}
            </ToggleGroupItem>
          </ToggleGroup>

          {destination === "existing" && (
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border p-1">
              {otherOpenBills.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  {t("bill.split.destination.existing.empty")}
                </p>
              ) : (
                // No Suspense boundary needed here any more: each row's
                // item count and total come off the `openBillsQuery` row the
                // parent already loaded, so nothing in this list opens a
                // query of its own that could suspend and tear this dialog
                // (and its selection state) down mid-edit.
                otherOpenBills.map((bill) => (
                  <ExistingBillOption
                    key={bill.id}
                    bill={bill}
                    tableName={
                      tables.find((table) => table.id === bill.tableId)?.name ??
                      null
                    }
                    selected={bill.id === targetBillId}
                    onSelect={() => setTargetBillId(bill.id)}
                  />
                ))
              )}
            </div>
          )}

          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="xs" onClick={selectAll}>
              {t("bill.split.selectAll")}
            </Button>
            <Button variant="ghost" size="xs" onClick={clearSelection}>
              {t("bill.split.clearSelection")}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
          {summaries.map((summary) => (
            <SplitBillRow
              key={summary.id}
              summary={summary}
              quantity={selected[summary.id] ?? 0}
              onChange={(quantity) => setQuantity(summary, quantity)}
            />
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-col">
          <div className="flex w-full items-center justify-between text-sm font-medium">
            <span>
              {t("bill.split.selectedCount")}{" "}
              <motion.span animate={totalQuantityPulseControls}>
                {totalQuantity}
              </motion.span>
            </span>
            <motion.span animate={totalAmountPulseControls}>
              {formatMoney({ value: totalAmount, currency }, locale)}
            </motion.span>
          </div>
          <div className="flex w-full gap-2">
            <DialogClose
              render={<Button variant="outline" size="lg" className="flex-1" />}
            >
              {t("bill.split.cancel")}
            </DialogClose>
            <Button
              size="lg"
              className="flex-1"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {t("bill.split.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExistingBillOption({
  bill,
  tableName,
  selected,
  onSelect,
}: {
  readonly bill: OpenBillRow
  readonly tableName: string | null
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  // From the row's own embedded `lines`/`items` — no per-bill query, so
  // nothing in this list can suspend on first render any more.
  const { itemCount, totalAmount } = useMemo(
    () =>
      deriveBillSummaryStats(
        calculateBillLineSummaries(bill.lines, bill.items)
      ),
    [bill]
  )

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md p-2 text-left hover:bg-muted",
        selected && "bg-primary/10 ring-1 ring-primary"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
        </p>
        {tableName !== null && (
          <p className="truncate text-xs text-muted-foreground">{tableName}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <p className="text-xs text-muted-foreground">
          {t("bill.itemsCount", { value: itemCount })}
        </p>
        <p className="text-sm font-semibold">
          {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
        </p>
      </div>
    </button>
  )
}

function SplitBillRow({
  summary,
  quantity,
  onChange,
}: {
  readonly summary: BillLineSummary
  readonly quantity: number
  readonly onChange: (quantity: number) => void
}) {
  const { t } = useTranslation()
  const quantityPulseControls = useChangePulse(quantity)

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{summary.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("bill.split.availableCount", { value: summary.quantity })}
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-md bg-muted p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={quantity === 0}
          aria-label={t("bill.split.decrease.aria", { name: summary.name })}
          onClick={() => {
            vibrateOnButtonPress()
            onChange(quantity - 1)
          }}
        >
          <MinusIcon />
        </Button>
        <motion.span
          className="min-w-6 text-center text-sm font-semibold tabular-nums"
          animate={quantityPulseControls}
        >
          {quantity}
        </motion.span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          disabled={quantity >= summary.quantity}
          aria-label={t("bill.split.increase.aria", { name: summary.name })}
          onClick={() => {
            vibrateOnButtonPress()
            onChange(quantity + 1)
          }}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}
