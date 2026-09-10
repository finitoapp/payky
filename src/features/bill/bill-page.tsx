import { sqliteTrue } from "@evolu/common"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { useStore } from "jotai"
import {
  AlertTriangleIcon,
  ChevronDown,
  Package,
  Redo2,
  ScanLineIcon,
  ShoppingBag,
  Split,
  Table2,
  Trash2Icon,
  Undo2,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { accountAtom } from "@/atoms/account.ts"
import { CategoryFilterBar } from "@/components/category-filter-bar.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"
import { SearchInput } from "@/components/search-input.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  cancelBill,
  confirmBillClosedDespiteCancellation,
  splitBill,
  splitBillIntoNewBill,
} from "@/core/modules/bill/bill-actions.ts"
import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import {
  type BillId,
  createRandomBillId,
} from "@/core/modules/bill/bill-types.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import {
  catalogItemsPageQuery,
  catalogItemsQuery,
} from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  type CategoryFilter,
  getStaffDisplayName,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
  NonNegativeInteger,
  type PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { vibrateOnButtonPress } from "@/core/native/haptics.ts"
import { AssignTableDialog } from "@/features/bill/assign-table-dialog.tsx"
import { BillScanView } from "@/features/bill/bill-scan-view.tsx"
import { getLatestCatalogItemSummary } from "@/features/bill/cart-utils.ts"
import { ItemBrickGridSkeleton } from "@/features/bill/item-brick-grid-skeleton.tsx"
import { ItemQuantityControls } from "@/features/bill/item-quantity-controls.tsx"
import {
  type SplitBillConfirmInput,
  SplitBillDialog,
} from "@/features/bill/split-bill-dialog.tsx"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import { useCartBill } from "@/features/bill/use-cart-bill.ts"
import { usePendingPayments } from "@/features/bill/use-pending-payments.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useBillInsertMode } from "@/hooks/use-bill-insert-mode.ts"
import { useChangePulse } from "@/hooks/use-change-pulse.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * The whole bill screen — the cart before its bill row exists and the cart
 * of an already-created bill, plus the closed/locked messages — lives in
 * this one component on purpose, so it never remounts across the moment the
 * first added item lazily creates the row: a remount tears down every DOM
 * node under it, and a tap whose press and release straddle that swap is
 * silently dropped by the browser (its click event lands on the two nodes'
 * common ancestor, never on the button). `billId` itself is stable from the
 * first render — generated client-side and put in the URL by whatever
 * linked here (see `pos-overview-page.tsx`'s `NewBillLink`, and
 * `_terminal.bill.tsx`'s `beforeLoad` for a direct navigation with none) —
 * only its row's existence changes mid-session, which is why the
 * bill-scoped hooks below all tolerate a `billId` whose row hasn't been
 * created yet.
 */
export function BillPage({
  billId,
  initialTableId,
}: {
  readonly billId: BillId
  readonly initialTableId?: TableId
}) {
  useScreenWakeLock(true)
  const { t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const fallbackCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK

  // Only meaningful before the bill row exists: it seeds the table the
  // lazily created row is assigned to. Once the row exists, `bill.tableId`
  // is the source of truth and this state is no longer read.
  const [pendingTableId, setPendingTableId] = useState<TableId | null>(
    initialTableId ?? null
  )

  const billQuery = useMemo(() => billByIdQuery(billId), [billId])
  const { data: billRows } = useEvoluQuery(billQuery)
  const bill = billRows[0]

  // Owned here, not inside BillCartView, so search text, the summary's
  // open/closed state, and the undo/redo history survive the moment the
  // first added item lazily creates the bill row.
  const cart = useCartBill({
    billId,
    currency: fallbackCurrency,
    tableId: pendingTableId,
    billExists: bill !== undefined,
    onTableSeedChange: setPendingTableId,
  })
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [scanMode, setScanMode] = useBillInsertMode()

  const summaries = useBillLineSummaries(billId)
  const pendingPaymentIds = usePendingPayments(billId)
  const billStatus = useBillStatus(billId)

  let content: ReactNode
  if (bill !== undefined && billStatus?.status !== "open") {
    content = billStatus?.hasCancellationCollision ? (
      <BillCancellationCollisionMessage
        billId={bill.id}
        currency={bill.currency}
      />
    ) : (
      <BillMessage message={t("bill.closed")} />
    )
  } else if (pendingPaymentIds.length > 0) {
    content = <BillLockedMessage paymentIds={pendingPaymentIds} />
  } else {
    content = (
      <BillCartView
        billId={billId}
        billExists={bill !== undefined}
        currency={bill?.currency ?? fallbackCurrency}
        summaries={summaries}
        // `pendingTableId` only seeds the bill row that's about to be
        // created; once it exists its own `tableId` is the source of truth,
        // so a table cleared on the bill isn't overwritten by the stale seed.
        tableId={bill === undefined ? pendingTableId : bill.tableId}
        cart={cart}
        search={search}
        onSearchChange={setSearch}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        summaryOpen={summaryOpen}
        onSummaryOpenChange={setSummaryOpen}
        scanMode={scanMode}
        onScanModeChange={setScanMode}
      />
    )
  }

  const title =
    bill === undefined
      ? undefined
      : (bill.label ?? t("bill.list.label", { number: bill.displayNumber }))

  return <BillPageLayout title={title}>{content}</BillPageLayout>
}

/**
 * Every bill state (new cart, resumed cart, not-found/closed message)
 * renders through this single frame, so the header — and its always-visible
 * link to saved carts — can never be left out of one state by accident.
 * `title` shows the bill's own label (falling back to its number) once one
 * exists; before that, and for the not-found/closed messages, it falls
 * back to the generic "Bill" title.
 */
function BillPageLayout({
  title,
  children,
}: {
  readonly title?: string
  readonly children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="h-6" />
      <FadeHeader title={title ?? t("bill.title")} />
      {children}
    </div>
  )
}

function BillMessage({ message }: { readonly message: string }) {
  return (
    <p className="mt-16 px-6 text-center text-muted-foreground">{message}</p>
  )
}

/**
 * The bill-level mirror of `payment-detail.tsx`'s canceled+claimed payment
 * collision: this bill was discarded, but its payments already cover its
 * total. Shown instead of the generic "closed" message whenever
 * `useBillStatus` reports the collision — see docs/bill-payment-states.md.
 *
 * Unlike a generic "closed" message, this is a screen staff must act on, so
 * it shows what's actually at stake (the bill's total) and links straight to
 * the payment(s) that funded it — the same "here's the specific payment,
 * go check it" pattern `BillLockedMessage` above already uses for a pending
 * one.
 */
function BillCancellationCollisionMessage({
  billId,
  currency,
}: {
  readonly billId: BillId
  readonly currency: FiatCurrencyType
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const appRun = useAppRun()
  const [resolvePending, setResolvePending] = useState(false)
  const summaries = useBillLineSummaries(billId)
  const claimedQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
  const { data: claimedPayments } = useEvoluQuery(claimedQuery)
  const paymentIds = useMemo(
    () => [...new Set(claimedPayments.map((payment) => payment.id))],
    [claimedPayments]
  )
  const totalAmount = NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )

  const handleConfirmClosedDespiteCancellation = async () => {
    setResolvePending(true)
    try {
      await using run = appRun()
      const result = await run(confirmBillClosedDespiteCancellation(billId))

      if (!result.ok) {
        toast.error(t("bill.collision.markClosed.error"))
      }
    } finally {
      setResolvePending(false)
    }
  }

  const handleRefund = () => {
    toast.info(t("bill.collision.refund.comingSoon"))
  }

  return (
    <div className="mt-16 flex flex-col items-center gap-4 px-6 text-center">
      <Alert variant="warning" className="text-left">
        <AlertTriangleIcon />
        <AlertTitle>{t("bill.collision.title")}</AlertTitle>
        <AlertDescription>{t("bill.collision.description")}</AlertDescription>
      </Alert>
      <strong className="text-2xl font-semibold tracking-tight">
        {formatMoney({ value: totalAmount, currency }, locale)}
      </strong>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {paymentIds.map((paymentId, index) => (
          <Button
            key={paymentId}
            variant="outline"
            nativeButton={false}
            render={<Link to="/activity/$paymentId" params={{ paymentId }} />}
          >
            {paymentIds.length > 1
              ? t("bill.collision.viewPayment.numbered", { number: index + 1 })
              : t("bill.collision.viewPayment")}
          </Button>
        ))}
        <Button
          className="h-12"
          disabled={resolvePending}
          onClick={() => void handleConfirmClosedDespiteCancellation()}
        >
          {t("bill.collision.markClosed")}
        </Button>
        <Button variant="outline" className="h-12" onClick={handleRefund}>
          {t("bill.collision.refund")}
        </Button>
      </div>
    </div>
  )
}

function BillLockedMessage({
  paymentIds,
}: {
  readonly paymentIds: ReadonlyArray<PaymentId>
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-16 flex flex-col items-center gap-4 px-6 text-center">
      <p className="text-muted-foreground">{t("bill.locked")}</p>
      <div className="flex flex-col gap-2">
        {paymentIds.map((paymentId, index) => (
          <Button
            key={paymentId}
            variant="outline"
            nativeButton={false}
            render={<Link to="/payment/$paymentId" params={{ paymentId }} />}
          >
            {paymentIds.length > 1
              ? t("bill.locked.viewPayment.numbered", { number: index + 1 })
              : t("bill.locked.viewPayment")}
          </Button>
        ))}
      </div>
    </div>
  )
}

interface CartApi {
  readonly pending: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly addOne: (catalogItem: CatalogItemRow) => Promise<void>
  readonly addQuantity: (
    catalogItem: CatalogItemRow,
    quantity: PositiveNumber
  ) => Promise<void>
  readonly removeOne: (summary: BillLineSummary) => Promise<void>
  readonly removeLine: (summary: BillLineSummary) => Promise<void>
  readonly clear: (summaries: ReadonlyArray<BillLineSummary>) => Promise<void>
  readonly assignTable: (tableId: TableId | null) => Promise<void>
  readonly undo: () => Promise<void>
  readonly redo: () => Promise<void>
}

interface SharedCartViewProps {
  readonly cart: CartApi
  readonly search: string
  readonly onSearchChange: (value: string) => void
  readonly categoryFilter: CategoryFilter
  readonly onCategoryFilterChange: (value: CategoryFilter) => void
  readonly summaryOpen: boolean
  readonly onSummaryOpenChange: (open: boolean) => void
  readonly scanMode: boolean
  readonly onScanModeChange: (value: boolean) => void
}

function BillCartView({
  billId,
  billExists,
  currency,
  summaries,
  tableId,
  cart,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  summaryOpen,
  onSummaryOpenChange,
  scanMode,
  onScanModeChange,
}: {
  readonly billId: BillId
  /** Whether `billId`'s row has been written to Evolu yet. */
  readonly billExists: boolean
  readonly currency: FiatCurrencyType
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly tableId: TableId | null
} & SharedCartViewProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const router = useRouter()
  const appRun = useAppRun()
  const jotaiStore = useStore()
  const confirm = useConfirmDialog()
  const console = useConsole()
  const createTerminalPayment = useCreateTerminalPayment()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const [chargePending, setChargePending] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [splitPending, setSplitPending] = useState(false)

  const currentTable = tables.find((table) => table.id === tableId)

  // `cart.assignTable` runs on the cart's mutation queue, so it can't race
  // the lazy bill creation, and reports its own failures.
  const handleAssignTable = (nextTableId: TableId | null) => {
    setTablePickerOpen(false)
    void cart.assignTable(nextTableId)
  }

  const currencyItems = useMemo(
    () => catalogItems.filter((item) => item.currency === currency),
    [catalogItems, currency]
  )
  const usedCategoryIds = useMemo(
    () => new Set(currencyItems.map((item) => item.categoryId)),
    [currencyItems]
  )

  // The grid's own SQL-filtered, paginated read: `currencyItems` above stays
  // the full per-currency list (needed by scan mode's barcode lookup, which
  // must match against every item, not just the currently loaded page).
  // `search` is genuinely debounced (typing shouldn't requery on every
  // keystroke) and additionally deferred via `transition: true` so it can't
  // drive the query outside a transition; `categoryFilter`/`currency` don't
  // need time-based debouncing, just that same "defer into a transition"
  // treatment, which `useDeferredValue` gives natively — no timer needed.
  // Both are required so a search keystroke or a category tap never
  // re-suspends this component: `BillPage`'s doc comment explains why a
  // remount here would drop a tap mid-press. `search`/`categoryFilter`
  // themselves stay plain, immediate state so the input text and the
  // selected chip highlight update without any lag.
  const searchForQuery = useDebouncedValue(search, 250, { transition: true })
  const categoryFilterForQuery = useDeferredValue(categoryFilter)
  const currencyForQuery = useDeferredValue(currency)
  const createGridPageQuery = useCallback(
    (limit: number) =>
      catalogItemsPageQuery({
        search: searchForQuery,
        categoryFilter: categoryFilterForQuery,
        currency: currencyForQuery,
        limit,
      }),
    [searchForQuery, categoryFilterForQuery, currencyForQuery]
  )
  const {
    rows: pagedItems,
    hasMore: hasMoreItems,
    isPending: isLoadingMoreItems,
    sentinelRef: itemsSentinelRef,
  } = useInfiniteEvoluQuery(
    [searchForQuery, categoryFilterForQuery, currencyForQuery],
    createGridPageQuery
  )

  const totalAmount = useMemo(
    () =>
      NonNegativeInteger(
        summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
      ),
    [summaries]
  )
  const itemCount = useMemo(
    () => summaries.reduce((sum, summary) => sum + summary.quantity, 0),
    [summaries]
  )
  const totalAmountPulseControls = useChangePulse(totalAmount)

  const handleCharge = async () => {
    if (summaries.length === 0) return

    setChargePending(true)
    try {
      if (settings?.tipsEnabled === sqliteTrue) {
        await navigate({
          to: "/payment/tip",
          search: { amount: totalAmount, currency, billId },
        })
        return
      }

      const created = await createTerminalPayment({
        amount: totalAmount,
        currency,
        tipAmount: NonNegativeInteger(0),
        billId,
      })
      if (!created) toast.error(t("payment.create.error"))
    } finally {
      setChargePending(false)
    }
  }

  // The action fires long after this render is gone, so it must not depend
  // on anything the render captured: `cart.undo` reads the top of the undo
  // stack from a ref at click time (see `use-cart-bill.ts`) rather than from
  // the snapshot that was current when the toast was raised.
  const showUndoToast = (message: string) =>
    toast(message, {
      action: {
        label: t("bill.summary.undo"),
        onClick: () => void cart.undo(),
      },
    })

  const handleDiscard = async () => {
    if (!billExists) return

    const confirmed = await confirm({
      title: t("bill.discard.confirm.title"),
      description: t("bill.discard.confirm.description"),
      confirmLabel: t("bill.discard.confirm.confirm"),
      cancelLabel: t("bill.discard.confirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return

    await using run = appRun()
    const result = await run(cancelBill(billId))
    if (!result.ok) {
      console.error("Failed to discard cart", result.error)
      toast.error(t("settings.saveFailed"))
      return
    }

    router.history.back()
  }

  const splitErrorMessageKey = (type: string) => {
    if (type === "BillLocked") return "bill.locked" as const
    // The selection no longer matches the bill, so retrying the same one
    // cannot work — say so, rather than the generic "try again".
    if (type === "BillSplitSelectionStale")
      return "bill.split.staleSelection" as const
    return "bill.split.error" as const
  }

  const handleSplitError = (error: { readonly type: string }) => {
    console.error("Failed to split bill", error)
    toast.error(t(splitErrorMessageKey(error.type)))
  }

  const handleConfirmSplit = async (input: SplitBillConfirmInput) => {
    setSplitPending(true)
    try {
      await using run = appRun()

      if (input.destination === "new") {
        const { device } = await jotaiStore.get(accountAtom)
        const newBillId = createRandomBillId()
        const result = await run(
          splitBillIntoNewBill({
            sourceBillId: billId,
            targetBillId: newBillId,
            deviceId: device.id,
            tableId,
            currency,
            items: input.items,
          })
        )
        if (!result.ok) {
          handleSplitError(result.error)
          return
        }

        setSplitDialogOpen(false)
        // A brand-new bill always needs setup (table, charge), so jump there
        // regardless of whether this bill kept any items of its own.
        // `replace` so the back button returns to the floor view rather than
        // this bill (which may no longer even be open).
        await navigate({
          to: "/bill",
          search: { billId: newBillId },
          replace: true,
        })
        return
      }

      const result = await run(
        splitBill({
          sourceBillId: billId,
          targetBillId: input.targetBillId,
          items: input.items,
        })
      )
      if (!result.ok) {
        handleSplitError(result.error)
        return
      }

      setSplitDialogOpen(false)
      // Unlike splitting into a new bill, an existing target isn't something
      // that needs setup — only follow it there if this bill emptied out and
      // got auto-canceled, so there's nothing left here to keep working on.
      // `replace` so the back button returns to the floor view rather than
      // this now-canceled bill.
      if (result.value.sourceCanceled) {
        await navigate({
          to: "/bill",
          search: { billId: input.targetBillId },
          replace: true,
        })
      }
    } finally {
      setSplitPending(false)
    }
  }

  return (
    <>
      <SplitBillDialog
        open={splitDialogOpen}
        onOpenChange={setSplitDialogOpen}
        billId={billId}
        summaries={summaries}
        currency={currency}
        pending={splitPending}
        onConfirm={(input) => void handleConfirmSplit(input)}
      />

      <div className="shrink-0">
        <AssignTableDialog
          open={tablePickerOpen}
          onOpenChange={setTablePickerOpen}
          billId={billId}
          currentTableId={tableId}
          onAssign={handleAssignTable}
        />

        <div className="mt-2 flex gap-2">
          <SearchInput
            className="flex-1"
            value={search}
            onChange={onSearchChange}
            placeholder={t("bill.search")}
            clearAriaLabel={t("bill.search.clear.aria")}
          />
          <Button
            type="button"
            variant={scanMode ? "default" : "outline"}
            size="icon"
            className="size-12 shrink-0"
            aria-pressed={scanMode}
            aria-label={t("bill.scan.toggle.aria")}
            onClick={() => onScanModeChange(!scanMode)}
          >
            <ScanLineIcon />
          </Button>
        </div>
        {!scanMode && (
          <CategoryFilterBar
            className="mt-2"
            categories={categories}
            usedCategoryIds={usedCategoryIds}
            value={categoryFilter}
            onValueChange={onCategoryFilterChange}
            allLabel={t("bill.category.all")}
            uncategorizedLabel={t("bill.category.uncategorized")}
          />
        )}
      </div>
      <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain mt-2">
        {scanMode ? (
          <BillScanView
            currencyItems={currencyItems}
            categories={categories}
            currency={currency}
            summaries={summaries}
            locale={locale}
            onAdd={(catalogItem) => void cart.addOne(catalogItem)}
            onAddQuantity={(catalogItem, quantity) =>
              void cart.addQuantity(catalogItem, quantity)
            }
            onRemove={(summary) => void cart.removeOne(summary)}
          />
        ) : currencyItems.length === 0 ? (
          <BillEmptyCatalog />
        ) : pagedItems.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground">
            {t("bill.emptySearch")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 pb-4">
              {pagedItems.map((catalogItem) => (
                <ItemBrick
                  key={catalogItem.id}
                  catalogItem={catalogItem}
                  summaries={summaries}
                  locale={locale}
                  onAdd={() => void cart.addOne(catalogItem)}
                  onAddQuantity={(quantity) =>
                    void cart.addQuantity(catalogItem, quantity)
                  }
                  onRemove={(summary) => void cart.removeOne(summary)}
                />
              ))}
            </div>
            {hasMoreItems && (
              <>
                {isLoadingMoreItems && <ItemBrickGridSkeleton />}
                <div ref={itemsSentinelRef} aria-hidden className="h-1" />
              </>
            )}
          </>
        )}
      </section>

      <Card className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-xl rounded-none rounded-t-xl p-0">
        <CardContent className="pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Collapsible open={summaryOpen} onOpenChange={onSummaryOpenChange}>
            <CollapsibleTrigger
              data-testid="bill-summary-trigger"
              className="w-full pt-4 text-left"
              disabled={summaries.length === 0 && !cart.canUndo}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-base text-muted-foreground">
                  <ShoppingBag className="size-4" />
                  {t("bill.itemsCount", { value: itemCount })}
                </div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <motion.span animate={totalAmountPulseControls}>
                    {formatMoney({ value: totalAmount, currency }, locale)}
                  </motion.span>
                  <ChevronDown
                    className={
                      summaryOpen
                        ? "size-4 transition-transform duration-200"
                        : "size-4 rotate-180 transition-transform duration-200"
                    }
                  />
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent
              data-testid="bill-summary-panel"
              className="grid grid-rows-[1fr] overflow-hidden transition-[grid-template-rows] duration-300 ease-out data-ending-style:grid-rows-[0fr] data-starting-style:grid-rows-[0fr]"
            >
              {/*
               * `grid-template-rows: 0fr -> 1fr` (rather than animating a
               * measured pixel height) keeps tracking the content's actual
               * size every frame, so it can't visibly jump if that size
               * settles a moment after the row is measured.
               */}
              <div className="flex min-h-0 flex-col gap-4 pt-4">
                <div className="max-h-48 overflow-x-hidden overflow-y-auto">
                  <div className="flex flex-col divide-y">
                    {summaries.map((summary) => (
                      <SummaryRow
                        key={summary.id}
                        summary={summary}
                        locale={locale}
                        disabled={cart.pending}
                        onRemove={(removedSummary) => {
                          void cart.removeLine(removedSummary).then(() => {
                            showUndoToast(
                              t("bill.summary.removeLine.toast", {
                                name: removedSummary.name,
                              })
                            )
                          })
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className={"gap-1 flex"}>
                    <Button
                      variant="outline"
                      size={"xs"}
                      disabled={!cart.canUndo || cart.pending}
                      onClick={() => void cart.undo()}
                    >
                      <Undo2 data-icon="inline-start" />
                      {t("bill.summary.undo")}
                    </Button>
                    <Button
                      variant="outline"
                      size={"xs"}
                      disabled={!cart.canRedo || cart.pending}
                      onClick={() => void cart.redo()}
                    >
                      <Redo2 data-icon="inline-start" />
                      {t("bill.summary.redo")}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size={"xs"}
                    disabled={summaries.length === 0 || cart.pending}
                    onClick={() => {
                      void cart.clear(summaries).then(() => {
                        showUndoToast(t("bill.summary.clear.toast"))
                      })
                    }}
                  >
                    {t("bill.summary.clear")}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center gap-2 pt-4">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 text-destructive"
              disabled={!billExists}
              aria-label={t("bill.discard")}
              onClick={() => void handleDiscard()}
            >
              <Trash2Icon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              disabled={summaries.length === 0 || splitPending}
              aria-label={t("bill.split.button.aria")}
              onClick={() => setSplitDialogOpen(true)}
            >
              <Split />
            </Button>
            <Button
              variant="outline"
              className="h-12 flex-1 text-sm"
              aria-label={t("bill.table.aria")}
              onClick={() => setTablePickerOpen(true)}
            >
              <Table2 data-icon="inline-start" />
              {currentTable?.name ?? t("bill.table.assign")}
            </Button>
            <Button
              variant="default"
              className="h-12 flex-1 text-sm font-bold"
              disabled={summaries.length === 0 || chargePending}
              onClick={() => {
                vibrateOnButtonPress()
                void handleCharge()
              }}
            >
              {t("home.pay")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function BillEmptyCatalog() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-lg font-semibold">{t("settings.items.empty.title")}</p>
      <p className="max-w-72 text-balance text-sm text-muted-foreground">
        {t("settings.items.empty.description")}
      </p>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link to="/settings/items/new" />}
      >
        {t("settings.items.add")}
      </Button>
    </div>
  )
}

function SummaryRow({
  summary,
  locale,
  disabled,
  onRemove,
}: {
  readonly summary: BillLineSummary
  readonly locale: string
  readonly disabled: boolean
  readonly onRemove: (summary: BillLineSummary) => void
}) {
  const { t } = useTranslation()
  const pulseControls = useChangePulse(summary.quantity)

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{summary.name}</p>
        <p className="text-xs text-muted-foreground">
          <motion.span animate={pulseControls}>{summary.quantity}</motion.span>{" "}
          ×{" "}
          {formatMoney(
            {
              value: NonNegativeInteger(summary.totalAmount / summary.quantity),
              currency: summary.currency,
            },
            locale
          )}
        </p>
      </div>
      <motion.p className="text-sm font-semibold" animate={pulseControls}>
        {formatMoney(
          { value: summary.totalAmount, currency: summary.currency },
          locale
        )}
      </motion.p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("bill.summary.removeLine.aria", { name: summary.name })}
        disabled={disabled}
        onClick={() => onRemove(summary)}
      >
        <X />
      </Button>
    </div>
  )
}

function ItemBrick({
  catalogItem,
  summaries,
  locale,
  onAdd,
  onAddQuantity,
  onRemove,
}: {
  readonly catalogItem: CatalogItemRow
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly locale: string
  readonly onAdd: () => void
  readonly onAddQuantity: (quantity: PositiveNumber) => void
  readonly onRemove: (summary: BillLineSummary) => void
}) {
  const matchingSummaries = useMemo(
    () =>
      summaries.filter((summary) => summary.catalogItemId === catalogItem.id),
    [summaries, catalogItem.id]
  )
  const quantity = useMemo(
    () => matchingSummaries.reduce((sum, summary) => sum + summary.quantity, 0),
    [matchingSummaries]
  )
  const latestSummary = useMemo(
    () => getLatestCatalogItemSummary(matchingSummaries, catalogItem.id),
    [catalogItem.id, matchingSummaries]
  )

  const inCart = quantity > 0

  return (
    <Card
      className={cn(
        "relative gap-3 p-3",
        inCart && "bg-primary text-primary-foreground"
      )}
    >
      <div
        className={cn(
          "absolute top-3 right-3 flex size-9 items-center justify-center bg-muted text-muted-foreground rounded-sm",
          inCart && "bg-primary-foreground/15 text-primary-foreground"
        )}
      >
        <Package className="size-5" />
      </div>
      <div className="min-w-0 pr-11">
        <p className="font-medium">{getStaffDisplayName(catalogItem)}</p>
        <p
          className={cn(
            "text-sm text-muted-foreground",
            inCart && "text-primary-foreground/80"
          )}
        >
          {formatMoney(
            { value: catalogItem.unitAmount, currency: catalogItem.currency },
            locale
          )}
        </p>
      </div>
      <ItemQuantityControls
        name={getStaffDisplayName(catalogItem)}
        quantity={quantity}
        inCart={inCart}
        onAdd={onAdd}
        onAddQuantity={onAddQuantity}
        onRemove={() => {
          if (latestSummary === undefined) return
          onRemove(latestSummary)
        }}
      />
    </Card>
  )
}
