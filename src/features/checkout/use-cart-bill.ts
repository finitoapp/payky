import { useStore } from "jotai"
import { useCallback, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import {
  addCatalogItemToBill,
  appendRemoveBillLine,
  createBillAtEnd,
} from "@/core/modules/bill/bill-actions.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"
import { appendBillLines } from "@/core/modules/bill-line/bill-line-actions.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { getBillLineSummaryUnitAmount } from "@/features/checkout/cart-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"

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
  onBillCreated,
}: {
  readonly billId: BillId | undefined
  readonly currency: FiatCurrency
  readonly onBillCreated: (createdBillId: BillId) => void
}) {
  const appRun = useAppRun()
  const console = useConsole()
  const jotaiStore = useStore()
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
        tableId: null,
        currency,
      })
    )
    onBillCreated(created)
    return created
  }, [appRun, billId, currency, jotaiStore, onBillCreated])

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
    [appRun, console, ensureBillId, jotaiStore, record]
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
    [appRun, console, billId, jotaiStore, record]
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
    [appRun, console, billId, jotaiStore, record]
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
        await run.ok(appendBillLines(lines, billId))
        record(lines)
      } finally {
        setPending(false)
      }
    },
    [appRun, billId, jotaiStore, record]
  )

  const undo = useCallback(async () => {
    const entry = undoStack.at(-1)
    if (billId === undefined || entry === undefined) return

    setPending(true)
    try {
      await using run = appRun()
      await run.ok(appendBillLines(entry.map(invertLine), billId))
      setUndoStack((stack) => stack.slice(0, -1))
      setRedoStack((stack) => [...stack, entry])
    } finally {
      setPending(false)
    }
  }, [appRun, billId, undoStack])

  const redo = useCallback(async () => {
    const entry = redoStack.at(-1)
    if (billId === undefined || entry === undefined) return

    setPending(true)
    try {
      await using run = appRun()
      await run.ok(appendBillLines(entry, billId))
      setRedoStack((stack) => stack.slice(0, -1))
      setUndoStack((stack) => [...stack, entry])
    } finally {
      setPending(false)
    }
  }, [appRun, billId, redoStack])

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
