import { useStore } from "jotai"
import { useCallback, useRef, useState } from "react"
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
  claimedTransactionsByBillIdQuery,
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
 * Owns the mutation side of a cart: lazily creating the bill row on the
 * first line, adding/removing catalog item taps and whole lines, clearing
 * the cart, and a local undo/redo stack over the lines actually appended.
 *
 * The visible cart contents are never derived from this hook's state —
 * only from the live `useBillLineSummaries` query — this hook only issues
 * mutations and remembers enough to invert them.
 */
export function useCartBill({
  billId,
  currency,
  tableId,
  billExists,
}: {
  /**
   * Generated client-side and already in the `/bill` URL from the first
   * render — see `bill-page.tsx` and `pos-overview-page.tsx`'s
   * `NewBillLink`. Its row may not exist yet; see `billExists`.
   */
  readonly billId: BillId
  readonly currency: FiatCurrency
  /** Table to assign when the bill row is lazily created on the first line. */
  readonly tableId: TableId | null
  /** Whether `billId`'s row has been written to Evolu yet. */
  readonly billExists: boolean
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

  // Every cart mutation runs through this promise chain, so taps are queued
  // and applied in tap order instead of racing each other. The item grid
  // must therefore never disable its "+"/"-" controls while a mutation is in
  // flight: a button that turns `disabled` between a tap's press and the
  // browser dispatching its click event swallows that click entirely, so the
  // second of two rapid taps was silently lost. Ordering matters here beyond
  // safety — the bill-line ledger is append-only and undo/redo replays it in
  // reverse, so out-of-order appends would make undo pop the wrong entry.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingCountRef = useRef(0)

  const runQueued = useCallback(
    async (operation: () => Promise<void>): Promise<void> => {
      pendingCountRef.current += 1
      setPending(true)

      // Both handlers run `operation`: a failed predecessor must not cancel
      // the taps queued behind it.
      const queued = queueRef.current.then(operation, operation)
      queueRef.current = queued.then(
        () => undefined,
        () => undefined
      )

      try {
        await queued
      } finally {
        pendingCountRef.current -= 1
        if (pendingCountRef.current === 0) setPending(false)
      }
    },
    []
  )

  // Guards `ensureBillExists` against creating the bill row twice when
  // several adds are triggered before `billExists` (derived from the bill
  // query) turns true (re-render lag, or two rapid scans in scan mode) —
  // without it, each call sees `billExists === false` and starts its own
  // `createBillAtEnd`. Unlike the id, this never needs resetting mid-mount:
  // `billId` is fixed for the lifetime of this cart (see `bill-page.tsx`),
  // so there's no "later add should start a fresh bill" case to guard for.
  const pendingBillCreationRef = useRef<Promise<void> | null>(null)

  const record = useCallback((entry: CartHistoryEntry) => {
    setUndoStack((stack) => [...stack, entry])
    setRedoStack([])
  }, [])

  const ensureBillExists = useCallback(async (): Promise<void> => {
    if (billExists) return
    if (pendingBillCreationRef.current !== null) {
      await pendingBillCreationRef.current
      return
    }

    const creation = (async () => {
      const { device } = await jotaiStore.get(accountAtom)
      await using run = appRun()
      await run.ok(
        createBillAtEnd({
          id: billId,
          deviceId: device.id,
          label: null,
          tableId,
          currency,
        })
      )

      // Warm the read-side queries the bill view reads unconditionally, so
      // they're already resolved and `use()` doesn't suspend — an uncached
      // suspend here bubbled up to the route's Suspense boundary and
      // blanked the whole page for a beat. Keep this in sync with every
      // query the bill view's `use()` reads, including `usePendingPayments`'s
      // and `useBillStatus`'s — the latter also reads
      // `billLinesByBillIdQuery`/`itemsQuery` (already listed here for line
      // summaries), so a brand-new bill's derived status is never computed
      // from an unresolved query.
      await Promise.all([
        evolu.loadQuery(billByIdQuery(billId)),
        evolu.loadQuery(billLinesByBillIdQuery(billId)),
        evolu.loadQuery(itemsQuery),
        evolu.loadQuery(paymentsByBillIdQuery(billId)),
        evolu.loadQuery(claimedPaymentsByBillIdQuery(billId)),
        evolu.loadQuery(claimedTransactionsByBillIdQuery(billId)),
      ])
    })()
    pendingBillCreationRef.current = creation

    try {
      await creation
    } catch (error) {
      pendingBillCreationRef.current = null
      throw error
    }
  }, [appRun, billExists, billId, currency, evolu, jotaiStore, tableId])

  const addQuantity = useCallback(
    (catalogItem: CatalogItemRow, quantity: PositiveNumber) =>
      runQueued(async () => {
        await ensureBillExists()
        const { device } = await jotaiStore.get(accountAtom)
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
          console.error("Failed to add catalog item to cart", result.error)
          showCartMutationErrorToast(t, result.error)
          return
        }

        record([
          {
            billId,
            deviceId: device.id,
            catalogItemId: catalogItem.id,
            itemId: result.value.itemId,
            type: "catalogItem",
            kind: "add",
            quantity,
            totalAmount: NonNegativeInteger(catalogItem.unitAmount * quantity),
          },
        ])
      }),
    [
      appRun,
      billId,
      console,
      ensureBillExists,
      jotaiStore,
      record,
      runQueued,
      t,
    ]
  )

  const addOne = useCallback(
    (catalogItem: CatalogItemRow) =>
      addQuantity(catalogItem, PositiveNumber(1)),
    [addQuantity]
  )

  const removeOne = useCallback(
    async (summary: BillLineSummary) => {
      await runQueued(async () => {
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
      })
    },
    [appRun, console, billId, jotaiStore, record, runQueued, t]
  )

  const removeLine = useCallback(
    async (summary: BillLineSummary) => {
      await runQueued(async () => {
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
      })
    },
    [appRun, console, billId, jotaiStore, record, runQueued, t]
  )

  const clear = useCallback(
    async (summaries: ReadonlyArray<BillLineSummary>) => {
      if (summaries.length === 0) return

      await runQueued(async () => {
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
      })
    },
    [appRun, console, billId, jotaiStore, record, runQueued, t]
  )

  const undo = useCallback(async () => {
    const entry = undoStack.at(-1)
    if (entry === undefined) return

    await runQueued(async () => {
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
    })
  }, [appRun, console, billId, runQueued, undoStack, t])

  const redo = useCallback(async () => {
    const entry = redoStack.at(-1)
    if (entry === undefined) return

    await runQueued(async () => {
      await using run = appRun()
      const result = await run(appendGuardedBillLines(billId, entry))
      if (!result.ok) {
        console.error("Failed to redo cart change", result.error)
        showCartMutationErrorToast(t, result.error)
        return
      }

      setRedoStack((stack) => stack.slice(0, -1))
      setUndoStack((stack) => [...stack, entry])
    })
  }, [appRun, console, billId, redoStack, runQueued, t])

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
