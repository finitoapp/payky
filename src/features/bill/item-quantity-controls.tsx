import { Minus, Plus } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"

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
import { Input } from "@/components/ui/input.tsx"
import { PositiveNumber } from "@/core/modules/shared/schema.ts"
import { vibrateOnButtonPress } from "@/core/native/haptics.ts"
import { useChangePulse } from "@/hooks/use-change-pulse.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"

/**
 * The "-" / quantity / "+" cluster and its custom-quantity dialog, shared by
 * the bill item grid (`ItemBrick`) and the scan-mode last-scanned panel.
 * Confirming the dialog adds `quantity` on top of the current cart quantity
 * — it is not a "set to N" control, matching the "+" button's semantics.
 *
 * These controls deliberately have no "busy" disabled state: a button that
 * turns `disabled` between a tap's press and the browser dispatching its
 * click event receives no click at all, so gating them on the cart's pending
 * flag silently dropped the second of two rapid taps. `useCartBill` queues
 * the taps instead.
 */
export function ItemQuantityControls({
  name,
  quantity,
  inCart,
  onAdd,
  onAddQuantity,
  onRemove,
}: {
  readonly name: string
  readonly quantity: number
  readonly inCart: boolean
  readonly onAdd: () => void
  readonly onAddQuantity: (quantity: PositiveNumber) => void
  readonly onRemove: () => void
}) {
  const { t } = useTranslation()
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false)
  const [quantityInput, setQuantityInput] = useState("")
  const quantityPulseControls = useChangePulse(quantity)

  const parsedQuantityInput = Number(quantityInput)
  const canConfirmQuantity =
    Number.isInteger(parsedQuantityInput) && parsedQuantityInput > 0

  const handleConfirmQuantity = () => {
    if (!canConfirmQuantity) return

    onAddQuantity(PositiveNumber(parsedQuantityInput))
    setQuantityDialogOpen(false)
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-end gap-1 self-end rounded-md bg-muted p-1",
          inCart && "bg-primary-foreground/15"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label={t("bill.brick.remove.aria", { name })}
          disabled={quantity === 0}
          onClick={() => {
            vibrateOnButtonPress()
            onRemove()
          }}
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 min-w-10 rounded-full px-2 font-semibold tabular-nums"
          aria-label={t("bill.brick.quantity.trigger.aria", { name })}
          onClick={() => {
            setQuantityInput(quantity > 0 ? String(quantity) : "")
            setQuantityDialogOpen(true)
          }}
        >
          <motion.span animate={quantityPulseControls}>{quantity}</motion.span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label={t("bill.brick.add.aria", { name })}
          onClick={() => {
            vibrateOnButtonPress()
            onAdd()
          }}
        >
          <Plus />
        </Button>
      </div>

      <Dialog open={quantityDialogOpen} onOpenChange={setQuantityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              {t("bill.brick.quantity.description")}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t("bill.brick.quantity.input.aria")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={quantityInput}
            onChange={(event) => {
              const nextValue = event.currentTarget.value
              if (/^\d*$/.test(nextValue)) setQuantityInput(nextValue)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleConfirmQuantity()
            }}
          />
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
              onClick={() => setQuantityInput("")}
            >
              {t("bill.brick.quantity.cancel")}
            </DialogClose>
            <Button
              disabled={!canConfirmQuantity}
              onClick={handleConfirmQuantity}
            >
              {t("bill.brick.quantity.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
