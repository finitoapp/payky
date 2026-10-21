import { PositiveNumber } from "@payky/core/modules/shared/schema"
import { useState } from "react"
import { Keyboard } from "react-native"
import { Button } from "../../components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.tsx"
import { Input } from "../../components/ui/input.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * Web's `ItemQuantityDialog`: adds a typed number of pieces on top of what
 * the cart holds, as "+" does, so the field opens empty rather than with
 * the current quantity (which read as "set to N"). The body mounts with the
 * dialog, so the field is empty again on every open. Web's scan-panel
 * `ItemQuantityControls` cluster has no native twin: native's scan panel
 * shows the grid's own item brick.
 */
export function ItemQuantityDialog({
  name,
  open,
  onOpenChange,
  onAddQuantity,
}: {
  readonly name: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onAddQuantity: (quantity: PositiveNumber) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ItemQuantityDialogBody
          name={name}
          onClose={() => {
            Keyboard.dismiss()
            onOpenChange(false)
          }}
          onAddQuantity={onAddQuantity}
        />
      ) : null}
    </Dialog>
  )
}

function ItemQuantityDialogBody({
  name,
  onClose,
  onAddQuantity,
}: {
  readonly name: string
  readonly onClose: () => void
  readonly onAddQuantity: (quantity: PositiveNumber) => void
}) {
  const { t } = useTranslation()
  const [quantityInput, setQuantityInput] = useState("")
  const parsedQuantity = Number(quantityInput)
  const canConfirm = Number.isInteger(parsedQuantity) && parsedQuantity > 0

  const confirm = () => {
    if (!canConfirm) return
    onAddQuantity(PositiveNumber(parsedQuantity))
    onClose()
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>
          {t("bill.brick.quantity.description")}
        </DialogDescription>
      </DialogHeader>
      <Input
        aria-label={t("bill.brick.quantity.input.aria")}
        keyboardType="number-pad"
        autoComplete="off"
        autoFocus
        value={quantityInput}
        onChangeText={(next) => {
          if (/^\d*$/.test(next)) setQuantityInput(next)
        }}
        onSubmitEditing={confirm}
      />
      <DialogFooter>
        <Button
          variant="outline"
          label={t("bill.brick.quantity.cancel")}
          onPress={onClose}
        />
        <Button
          label={t("bill.brick.quantity.confirm")}
          disabled={!canConfirm}
          onPress={confirm}
        />
      </DialogFooter>
    </DialogContent>
  )
}
