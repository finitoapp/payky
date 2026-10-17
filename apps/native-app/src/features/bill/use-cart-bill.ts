import { linesNeedDiscard } from "@payky/app-shared/cart-lines"
import {
  addCatalogItemToBill,
  appendRemoveBillLine,
  createBillAtEnd,
} from "@payky/core/modules/bill/bill-actions"
import { billByIdQuery } from "@payky/core/modules/bill/bill-queries"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import { getBillLineSummaryUnitAmount } from "@payky/core/modules/bill-line/bill-line-utils"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import {
  type FiatCurrency,
  type NonNegativeInteger,
  PositiveNumber,
} from "@payky/core/modules/shared/schema"
import { useAtomValue } from "jotai"
import { useRef, useState } from "react"
import { accountAtom } from "../../atoms/account.ts"
import { evoluAtom } from "../../atoms/evolu.ts"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useRequirePermission } from "../../core/use-access.ts"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * Native counterpart of web's `useCartBill`, minus undo/redo (with the toast
 * that offers it), table assignment and clear, which come with later tasks.
 * It only issues mutations; the visible cart is always the live line query.
 *
 * Every mutation runs through one promise chain so taps apply in tap order
 * (the bill-line ledger is append-only, so out-of-order appends are wrong) and
 * the item bricks never need to disable themselves mid-write: a button that
 * turns `disabled` between press and release swallows the tap.
 */
export function useCartBill({
  billId,
  currency,
}: {
  readonly billId: BillId
  readonly currency: FiatCurrency
}) {
  const appRun = useAppRun()
  const evolu = useAtomValue(evoluAtom)
  const { device } = useAtomValue(accountAtom)
  const toast = useToast()
  const { t } = useTranslation()
  const { require } = useRequirePermission()
  const [pending, setPending] = useState(false)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingCountRef = useRef(0)
  // Several taps before the new bill's row is visible must create it once.
  const billCreationRef = useRef<Promise<void> | null>(null)

  /** Resolves `true` only when the operation applied; failures are reported here. */
  const runQueued = async (
    operation: () => Promise<boolean>
  ): Promise<boolean> => {
    pendingCountRef.current += 1
    setPending(true)

    // A throw is a defect (e.g. the bill row cannot be created): report it
    // like a failed Result instead of leaving a tap that silently did nothing.
    const guarded = async (): Promise<boolean> => {
      try {
        return await operation()
      } catch (error) {
        nativeConsole.error("Cart mutation failed", error)
        toast.error(t("app.saveFailed"))
        return false
      }
    }

    // A failed predecessor must not cancel the taps queued behind it.
    const queued = queueRef.current.then(guarded, guarded)
    queueRef.current = queued
    try {
      return await queued
    } finally {
      pendingCountRef.current -= 1
      if (pendingCountRef.current === 0) setPending(false)
    }
  }

  // The row is read now, not taken from a render: the live query lags the write.
  const ensureBillExists = async (): Promise<void> => {
    if (billCreationRef.current !== null) return billCreationRef.current
    if ((await evolu.loadQuery(billByIdQuery(billId))).length > 0) return

    const creation = (async () => {
      await using run = appRun()
      // No table yet; the pos overview (P04) assigns one.
      await run.ok(
        createBillAtEnd({
          id: billId,
          deviceId: device.id,
          label: null,
          tableId: null,
          currency,
        })
      )
    })()
    billCreationRef.current = creation
    try {
      await creation
    } catch (error) {
      billCreationRef.current = null
      throw error
    }
  }

  const addQuantity = (catalogItem: CatalogItemRow, quantity: PositiveNumber) =>
    runQueued(async () => {
      await ensureBillExists()
      await using run = appRun()
      const result = await run(
        addCatalogItemToBill({
          billId,
          deviceId: device.id,
          catalogItemId: catalogItem.id,
          quantity,
        })
      )
      if (!result.ok) {
        nativeConsole.error("Failed to add catalog item to cart", result.error)
        toast.error(
          t(
            result.error.type === "BillLocked"
              ? "bill.locked"
              : "app.saveFailed"
          )
        )
        return false
      }
      return true
    })

  const addOne = (catalogItem: CatalogItemRow) =>
    addQuantity(catalogItem, PositiveNumber(1))

  /**
   * Appends a remove line covering part or all of `summary` (the ledger has no
   * notion of "one" versus "all"). It takes `discard` (access/0002), checked
   * on the lines about to be written, at action time: the prompt may be
   * dismissed, and the queue keeps later taps waiting behind it.
   */
  const removeFromCart = (
    summary: BillLineSummary,
    quantity: PositiveNumber,
    totalAmount: NonNegativeInteger
  ) =>
    runQueued(async () => {
      if (
        linesNeedDiscard([{ kind: "remove" }]) &&
        !(await require("discard", "access.action.removeLines"))
      )
        return false
      await using run = appRun()
      const result = await run(
        appendRemoveBillLine({
          billId,
          deviceId: device.id,
          quantity,
          totalAmount,
          lineSummary: summary,
        })
      )
      if (!result.ok) {
        nativeConsole.error("Failed to remove from cart", result.error)
        toast.error(
          t(
            result.error.type === "BillLocked"
              ? "bill.locked"
              : "app.saveFailed"
          )
        )
        return false
      }
      return true
    })

  const removeOne = (summary: BillLineSummary) =>
    removeFromCart(
      summary,
      PositiveNumber(1),
      getBillLineSummaryUnitAmount(summary)
    )

  const removeLine = (summary: BillLineSummary) =>
    removeFromCart(summary, summary.quantity, summary.totalAmount)

  return { pending, addOne, addQuantity, removeOne, removeLine }
}
