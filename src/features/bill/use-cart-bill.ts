import { useStore } from "jotai"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { accountAtom } from "@/atoms/account.ts"
import {
  addCatalogItemToBill,
  appendGuardedBillLines,
  appendRemoveBillLine,
  createBillAtEnd,
} from "@/core/modules/bill/bill-actions.ts"
import {
  claimedPaymentsByBillIdQuery,
  paymentsByBillIdQuery,
} from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"
import { billLinesByBillIdQuery } from "@/core/modules/bill-line/bill-line-queries.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { getBillLineSummaryUnitAmount } from "@/features/bill/cart-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Shows a toast for a failed cart mutation. `BillLocked` gets its own
 * message (reusing the same copy as the bill page's "locked" state) since
 * it is now a routine, expected outcome — a pending payment on the bill —
 * not a rare error; everything else falls back to the generic save-failed
 * message. See docs/bill-payment-states.md.
 */
const showCartMutationErrorToast = (
  t: ReturnType<typeof useTranslation>["t"],
  error: { readonly type: string }
): void => {
  toast.error(
    error.type === "BillLocked" ? t("bill.locked") : t("settings.saveFailed")
  )
}

type CartLine = Omit<BillLineRow, "id">
type CartHistoryEntry = ReadonlyArray<CartLine>

/**
 * Undoing/redoing a bill-line append is always just re-appending the same
 * line with its `kind` flipped — the append-only ledger design makes this
 * exact and needs no separate undo table.
 */
const invertLine = (line: CartLine): CartLine => ({
  ...line,
  kind: line.kind === "add" ? "remove" : "add",
})

/**
 * Owns the mutation side of a cart: lazily creating the bill on the first
 * line, adding/removing catalog item taps and whole lines, clearing the
 * cart, and a local undo/redo stack over the lines actually appended.
 *
 * The visible cart contents are never derived from this hook's state —
 * only from the live `useBillLineSummaries` query — this hook only issues
 * mutations and remembers enough to invert them.
 */
export function useCartBill({
  billId,
  currency,
  tableId,
  onBillCreated,
}: {
  readonly billId: BillId | undefined
  readonly currency: FiatCurrency
  /** Table to assign when the bill is lazily created on the first line. */
  readonly tableId: TableId | null
  readonly onBillCreated: (createdBillId: BillId) => void
}) {
  const appRun = useAppRun()
  const console = useConsole()
  const evolu = useEvolu()
  const jotaiStore = useStore()
  const { t } = useTranslation()
  const [undoStack, setUndoStack] = useState<ReadonlyArray<CartHistoryEntry>>(
    []
  )
  const [redoStack, setRedoStack] = useState<ReadonlyArray<CartHistoryEntry>>(
    []
  )
  const [pending, setPending] = useState(false)

  const record = useCallback((entry: CartHistoryEntry) => {
    setUndoStack((stack) => [...stack, entry])
    setRedoStack([])
  }, [])

  const ensureBillId = useCallback(async (): Promise<BillId> => {
    if (billId !== undefined) return billId

    const { device } = await jotaiStore.get(accountAtom)
    await using run = appRun()
    const created = await run.ok(
      createBillAtEnd({
        deviceId: device.id,
        label: null,
        tableId,
        currency,
      })
    )

    // Warm the read-side queries the newly mounted bill view will run
    // before flipping `billId`, so they're already resolved and `use()`
    // doesn't suspend — an uncached suspend here bubbled up to the route's
    // Suspense boundary and blanked the whole page for a beat. Keep this in
    // sync with every query the bill view's `use()` reads unconditionally
    // once `billId` is set, including `useBillLock`'s.
    await Promise.all([
      evolu.loadQuery(billByIdQuery(created)),
      evolu.loadQuery(billLinesByBillIdQuery(created)),
      evolu.loadQuery(itemsQuery),
      evolu.loadQuery(paymentsByBillIdQuery(created)),
      evolu.loadQuery(claimedPaymentsByBillIdQuery(created)),
    ])

    onBillCreated(created)
    return created
  }, [appRun, billId, currency, evolu, jotaiStore, onBillCreated, tableId])

  const addQuantity = useCallback(
    async (catalogItem: CatalogItemRow, quantity: PositiveNumber) => {
      setPending(true)
      try {
        const targetBillId = await ensureBillId()
        const { device } = await jotaiStore.get(accountAtom)
        await using run = appRun()

        const result = await run(
          addCatalogItemToBill({
            billId: targetBillId,
            deviceId: device.id,
            catalogItemId: catalogItem.id,
            quantity,
          })
        )
        if (!result.ok) {
          console.error("Failed to add catalog item to cart", result.error)
          showCartMutationErrorToast(t, result.error)
          return
        }

        record([
          {
            billId: targetBillId,
            deviceId: device.id,
            catalogItemId: catalogItem.id,
            itemId: result.value.itemId,
            type: "catalogItem",
            kind: "add",
            quantity,
            totalAmount: NonNegativeInteger(catalogItem.unitAmount * quantity),
          },
        ])
      } finally {
        setPending(false)
      }
    },
    [appRun, console, ensureBillId, jotaiStore, record, t]
  )

  const addOne = useCallback(
    (catalogItem: CatalogItemRow) =>
      addQuantity(catalogItem, PositiveNumber(1)),
    [addQuantity]
  )

  const removeOne = useCallback(
    async (summary: BillLineSummary) => {
      if (billId === undefined) return

      setPending(true)
      try {
        const { device } = await jotaiStore.get(accountAtom)
        const quantity = PositiveNumber(1)
        const totalAmount = getBillLineSummaryUnitAmount(summary)

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
          console.error("Failed to remove item from cart", result.error)
          showCartMutationErrorToast(t, result.error)
          return
        }

        record([
          {
            billId,
            deviceId: device.id,
            catalogItemId: summary.catalogItemId,
            itemId: summary.itemId,
            type: summary.type,
            kind: "remove",
            quantity,
            totalAmount,
          },
        ])
      } finally {
        setPending(false)
      }
    },
    [appRun, console, billId, jotaiStore, record, t]
  )

  const removeLine = useCallback(
    async (summary: BillLineSummary) => {
      if (billId === undefined) return

      setPending(true)
      try {
        const { device } = await jotaiStore.get(accountAtom)
        await using run = appRun()
        const result = await run(
          appendRemoveBillLine({
            billId,
            deviceId: device.id,
            quantity: summary.quantity,
            totalAmount: summary.totalAmount,
            lineSummary: summary,
          })
        )
        if (!result.ok) {
          console.error("Failed to remove line from cart", result.error)
          showCartMutationErrorToast(t, result.error)
          return
        }

        record([
          {
            billId,
            deviceId: device.id,
            catalogItemId: summary.catalogItemId,
            itemId: summary.itemId,
            type: summary.type,
            kind: "remove",
            quantity: summary.quantity,
            totalAmount: summary.totalAmount,
          },
        ])
      } finally {
        setPending(false)
      }
    },
    [appRun, console, billId, jotaiStore, record, t]
  )

  const clear = useCallback(
    async (summaries: ReadonlyArray<BillLineSummary>) => {
      if (billId === undefined || summaries.length === 0) return

      setPending(true)
      try {
        const { device } = await jotaiStore.get(accountAtom)
        const lines: CartHistoryEntry = summaries.map((summary) => ({
          billId,
          deviceId: device.id,
          catalogItemId: summary.catalogItemId,
          itemId: summary.itemId,
          type: summary.type,
          kind: "remove" as const,
          quantity: summary.quantity,
          totalAmount: summary.totalAmount,
        }))

        await using run = appRun()
        const result = await run(appendGuardedBillLines(billId, lines))
        if (!result.ok) {
          console.error("Failed to clear cart", result.error)
          showCartMutationErrorToast(t, result.error)
          return
        }

        record(lines)
      } finally {
        setPending(false)
      }
    },
    [appRun, console, billId, jotaiStore, record, t]
  )

  const undo = useCallback(async () => {
    const entry = undoStack.at(-1)
    if (billId === undefined || entry === undefined) return

    setPending(true)
    try {
      await using run = appRun()
      const result = await run(
        appendGuardedBillLines(billId, entry.map(invertLine))
      )
      if (!result.ok) {
        console.error("Failed to undo cart change", result.error)
        showCartMutationErrorToast(t, result.error)
        return
      }

      setUndoStack((stack) => stack.slice(0, -1))
      setRedoStack((stack) => [...stack, entry])
    } finally {
      setPending(false)
    }
  }, [appRun, console, billId, undoStack, t])

  const redo = useCallback(async () => {
    const entry = redoStack.at(-1)
    if (billId === undefined || entry === undefined) return

    setPending(true)
    try {
      await using run = appRun()
      const result = await run(appendGuardedBillLines(billId, entry))
      if (!result.ok) {
        console.error("Failed to redo cart change", result.error)
        showCartMutationErrorToast(t, result.error)
        return
      }

      setRedoStack((stack) => stack.slice(0, -1))
      setUndoStack((stack) => [...stack, entry])
    } finally {
      setPending(false)
    }
  }, [appRun, console, billId, redoStack, t])

  return {
    pending,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    addOne,
    addQuantity,
    removeOne,
    removeLine,
    clear,
    undo,
    redo,
  }
}
