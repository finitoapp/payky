import { sqliteTrue } from "@evolu/common"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  ChevronDown,
  Package,
  Redo2,
  ScanLineIcon,
  Search,
  ShoppingBag,
  Table2,
  Trash2Icon,
  Undo2,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import { type ReactNode, startTransition, useMemo, useState } from "react"
import { toast } from "sonner"
import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"
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
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  assignBillToTable,
  cancelBill,
  confirmBillClosedDespiteCancellation,
  removeTableFromBill,
} from "@/core/modules/bill/bill-actions.ts"
import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { catalogItemsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
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
import { ItemQuantityControls } from "@/features/bill/item-quantity-controls.tsx"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import { useCartBill } from "@/features/bill/use-cart-bill.ts"
import { usePendingPayments } from "@/features/bill/use-pending-payments.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useChangePulse } from "@/hooks/use-change-pulse.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

export function BillPage({
  billId,
  initialTableId,
}: {
  readonly billId: BillId | undefined
  readonly initialTableId?: TableId
}) {
  useScreenWakeLock(true)
  const navigate = useNavigate()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const fallbackCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK

  // Only meaningful before a bill exists: it seeds the table the lazily
  // created bill is assigned to. Once a bill exists, `bill.tableId` is the
  // source of truth and this state is no longer read.
  const [pendingTableId, setPendingTableId] = useState<TableId | null>(
    initialTableId ?? null
  )

  // Owned here, not inside BillCartView, so search text, the summary's
  // open/closed state, and the undo/redo history survive the moment the
  // first added item lazily creates the bill and the route's `billId`
  // search param switches from absent to present.
  const cart = useCartBill({
    billId,
    currency: fallbackCurrency,
    tableId: pendingTableId,
    onBillCreated: (createdBillId) => {
      // A transition so React keeps the current cart on screen instead of
      // showing the route's `fallback={null}` if anything on this path ever
      // suspends again, rather than blanking the page for a beat.
      startTransition(() => {
        void navigate({
          to: "/bill",
          search: { billId: createdBillId },
          replace: true,
        })
      })
    },
  })
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [scanMode, setScanMode] = useState(false)

  const sharedProps = {
    cart,
    search,
    onSearchChange: setSearch,
    categoryFilter,
    onCategoryFilterChange: setCategoryFilter,
    onPendingTableIdChange: setPendingTableId,
    summaryOpen,
    onSummaryOpenChange: setSummaryOpen,
    scanMode,
    onScanModeChange: setScanMode,
  }

  return billId === undefined ? (
    <BillPageLayout>
      <BillCartView
        billId={undefined}
        currency={fallbackCurrency}
        summaries={EMPTY_SUMMARIES}
        tableId={pendingTableId}
        {...sharedProps}
      />
    </BillPageLayout>
  ) : (
    <BillExistingBody billId={billId} {...sharedProps} />
  )
}

function BillExistingBody({
  billId,
  ...sharedProps
}: { readonly billId: BillId } & SharedCartViewProps) {
  const { t } = useTranslation()
  const { data: billRows } = useEvoluQuery(billByIdQuery(billId))
  const bill = billRows[0]
  const summaries = useBillLineSummaries(billId)
  const pendingPaymentIds = usePendingPayments(billId)
  const billStatus = useBillStatus(billId)

  let content: ReactNode
  if (bill === undefined) {
    content = <BillMessage message={t("bill.notFound")} />
  } else if (billStatus?.status !== "open") {
    content = billStatus?.hasCancellationCollision ? (
      <BillCancellationCollisionMessage
        billId={billId}
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
        currency={bill.currency}
        summaries={summaries}
        tableId={bill.tableId}
        {...sharedProps}
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

const EMPTY_SUMMARIES: ReadonlyArray<BillLineSummary> = []

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
  readonly undo: () => Promise<void>
  readonly redo: () => Promise<void>
}

type CategoryFilter = "all" | "uncategorized" | CatalogCategoryId

interface SharedCartViewProps {
  readonly cart: CartApi
  readonly search: string
  readonly onSearchChange: (value: string) => void
  readonly categoryFilter: CategoryFilter
  readonly onCategoryFilterChange: (value: CategoryFilter) => void
  readonly onPendingTableIdChange: (tableId: TableId | null) => void
  readonly summaryOpen: boolean
  readonly onSummaryOpenChange: (open: boolean) => void
  readonly scanMode: boolean
  readonly onScanModeChange: (value: boolean) => void
}

function BillCartView({
  billId,
  currency,
  summaries,
  tableId,
  cart,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  onPendingTableIdChange,
  summaryOpen,
  onSummaryOpenChange,
  scanMode,
  onScanModeChange,
}: {
  readonly billId: BillId | undefined
  readonly currency: FiatCurrencyType
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly tableId: TableId | null
} & SharedCartViewProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const router = useRouter()
  const appRun = useAppRun()
  const console = useConsole()
  const createTerminalPayment = useCreateTerminalPayment()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const [settings] = settingsData
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const [chargePending, setChargePending] = useState(false)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)

  const currentTable = tables.find((table) => table.id === tableId)

  const handleAssignTable = async (nextTableId: TableId | null) => {
    setTablePickerOpen(false)

    if (billId === undefined) {
      onPendingTableIdChange(nextTableId)
      return
    }

    try {
      await using run = appRun()
      if (nextTableId === null) {
        await run(removeTableFromBill(billId))
      } else {
        await run(assignBillToTable({ id: billId, tableId: nextTableId }))
      }
    } catch (error) {
      console.error("Failed to assign table to cart", error)
      toast.error(t("settings.saveFailed"))
    }
  }

  const currencyItems = useMemo(
    () => catalogItems.filter((item) => item.currency === currency),
    [catalogItems, currency]
  )
  const usedCategoryIds = useMemo(
    () => new Set(currencyItems.map((item) => item.categoryId)),
    [currencyItems]
  )
  const availableCategories = useMemo(
    () => categories.filter((category) => usedCategoryIds.has(category.id)),
    [categories, usedCategoryIds]
  )
  const showUncategorizedFilter = usedCategoryIds.has(null)
  const categoryFilteredItems = useMemo(() => {
    if (categoryFilter === "all") return currencyItems
    if (categoryFilter === "uncategorized") {
      return currencyItems.filter((item) => item.categoryId === null)
    }
    return currencyItems.filter((item) => item.categoryId === categoryFilter)
  }, [currencyItems, categoryFilter])
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query === ""
      ? categoryFilteredItems
      : categoryFilteredItems.filter((item) =>
          item.name.toLowerCase().includes(query)
        )
  }, [categoryFilteredItems, search])

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
    if (billId === undefined || summaries.length === 0) return

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

  const showUndoToast = (message: string) =>
    toast(message, {
      action: {
        label: t("bill.summary.undo"),
        onClick: () => void cart.undo(),
      },
    })

  const handleDiscard = async () => {
    if (billId === undefined) return

    await using run = appRun()
    const result = await run(cancelBill(billId))
    if (!result.ok) {
      console.error("Failed to discard cart", result.error)
      toast.error(t("settings.saveFailed"))
      return
    }

    router.history.back()
  }

  return (
    <>
      <div className="shrink-0">
        <AssignTableDialog
          open={tablePickerOpen}
          onOpenChange={setTablePickerOpen}
          billId={billId}
          currentTableId={tableId}
          onAssign={(nextTableId) => void handleAssignTable(nextTableId)}
        />

        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("bill.search")}
              placeholder={t("bill.search")}
              value={search}
              autoComplete="off"
              className="h-12 bg-card pl-12 text-base"
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
            {search !== "" && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
                aria-label={t("bill.search.clear.aria")}
                onClick={() => onSearchChange("")}
              >
                <X />
              </Button>
            )}
          </div>
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
        {!scanMode && availableCategories.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <ToggleGroup<CategoryFilter>
              value={[categoryFilter]}
              onValueChange={(nextValue) => {
                const [nextFilter] = nextValue
                if (nextFilter === undefined) return
                onCategoryFilterChange(nextFilter)
              }}
              variant="outline"
              size="sm"
              className="w-max"
            >
              <ToggleGroupItem value="all">
                {t("bill.category.all")}
              </ToggleGroupItem>
              {availableCategories.map((category) => (
                <ToggleGroupItem key={category.id} value={category.id}>
                  {category.name}
                </ToggleGroupItem>
              ))}
              {showUncategorizedFilter && (
                <ToggleGroupItem value="uncategorized">
                  {t("bill.category.uncategorized")}
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </div>
        )}
      </div>
      <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain mt-2">
        {scanMode ? (
          <BillScanView
            currencyItems={currencyItems}
            categories={categories}
            currency={currency}
            summaries={summaries}
            disabled={cart.pending}
            locale={locale}
            onAdd={(catalogItem) => void cart.addOne(catalogItem)}
            onAddQuantity={(catalogItem, quantity) =>
              void cart.addQuantity(catalogItem, quantity)
            }
            onRemove={(summary) => void cart.removeOne(summary)}
          />
        ) : currencyItems.length === 0 ? (
          <BillEmptyCatalog />
        ) : filteredItems.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground">
            {t("bill.emptySearch")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 pb-4">
            {filteredItems.map((catalogItem) => (
              <ItemBrick
                key={catalogItem.id}
                catalogItem={catalogItem}
                summaries={summaries}
                disabled={cart.pending}
                locale={locale}
                onAdd={() => void cart.addOne(catalogItem)}
                onAddQuantity={(quantity) =>
                  void cart.addQuantity(catalogItem, quantity)
                }
                onRemove={(summary) => void cart.removeOne(summary)}
              />
            ))}
          </div>
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
              disabled={billId === undefined}
              aria-label={t("bill.discard")}
              onClick={() => setDiscardDialogOpen(true)}
            >
              <Trash2Icon />
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
              disabled={
                billId === undefined || summaries.length === 0 || chargePending
              }
              onClick={() => {
                vibrateOnButtonPress()
                void handleCharge()
              }}
            >
              {t("home.pay")}
            </Button>
          </div>
        </CardContent>

        <AlertDialog
          open={discardDialogOpen}
          onOpenChange={setDiscardDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("bill.discard.confirm.title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("bill.discard.confirm.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("bill.discard.confirm.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleDiscard()}
              >
                {t("bill.discard.confirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  disabled,
  locale,
  onAdd,
  onAddQuantity,
  onRemove,
}: {
  readonly catalogItem: CatalogItemRow
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly disabled: boolean
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
        <p className="font-medium">{catalogItem.name}</p>
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
        name={catalogItem.name}
        quantity={quantity}
        disabled={disabled}
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
