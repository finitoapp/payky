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
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import {
  type FiatCurrency,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { vibrateOnButtonPress } from "@/core/native/haptics.ts"
import { getBillLineSummaryUnitAmount } from "@/features/bill/cart-utils.ts"
import { useChangePulse } from "@/hooks/use-change-pulse.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/** How many units of each line, keyed by `BillLineSummary["id"]`, are picked to move. */
type SplitSelection = Readonly<Record<string, number>>

/**
 * The `/bill` page's "split bill" entry point: lets staff pick how many
 * units of each line item move to a brand-new bill, then hands the picked
 * items (with quantity/totalAmount already reduced to the moved portion) to
 * `onConfirm` — the caller composes those into `splitBillIntoNewBill`.
 *
 * Selection is local dialog state, reset every time it opens, so a
 * previous split's picks never leak into the next one.
 */
export function SplitBillDialog({
  open,
  onOpenChange,
  summaries,
  currency,
  pending,
  onConfirm,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly currency: FiatCurrency
  readonly pending: boolean
  readonly onConfirm: (items: ReadonlyArray<BillLineSummary>) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [selected, setSelected] = useState<SplitSelection>({})

  useEffect(() => {
    if (open) setSelected({})
  }, [open])

  const setQuantity = (summary: BillLineSummary, quantity: number) => {
    setSelected((current) => ({
      ...current,
      [summary.id]: Math.min(Math.max(quantity, 0), summary.quantity),
    }))
  }

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
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = NonNegativeInteger(
    items.reduce((sum, item) => sum + item.totalAmount, 0)
  )
  const totalQuantityPulseControls = useChangePulse(totalQuantity)
  const totalAmountPulseControls = useChangePulse(totalAmount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{t("bill.split.title")}</DialogTitle>
          <DialogDescription>{t("bill.split.description")}</DialogDescription>
        </DialogHeader>
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
              disabled={items.length === 0 || pending}
              onClick={() => onConfirm(items)}
            >
              {t("bill.split.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
