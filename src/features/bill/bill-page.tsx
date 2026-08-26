import { sqliteTrue } from "@evolu/common"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronDown,
  Minus,
  Package,
  Plus,
  Redo2,
  Search,
  ShoppingBag,
  Table2,
  Trash2Icon,
  Undo2,
  X,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
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
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  assignBillToTable,
  cancelBill,
  removeTableFromBill,
} from "@/core/modules/bill/bill-actions.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { catalogItemsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { AssignTableDialog } from "@/features/bill/assign-table-dialog.tsx"
import { getLatestCatalogItemSummary } from "@/features/bill/cart-utils.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useCartBill } from "@/features/bill/use-cart-bill.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
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
      void navigate({
        to: "/bill",
        search: { billId: createdBillId },
        replace: true,
      })
    },
  })
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
  const [summaryOpen, setSummaryOpen] = useState(false)

  const sharedProps = {
    cart,
    search,
    onSearchChange: setSearch,
    categoryFilter,
    onCategoryFilterChange: setCategoryFilter,
    onPendingTableIdChange: setPendingTableId,
    summaryOpen,
    onSummaryOpenChange: setSummaryOpen,
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

  let content: ReactNode
  if (bill === undefined) {
    content = <BillMessage message={t("bill.notFound")} />
  } else if (bill.status !== "open" && bill.status !== "partiallyPaid") {
    content = <BillMessage message={t("bill.closed")} />
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
}: {
  readonly billId: BillId | undefined
  readonly currency: FiatCurrencyType
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly tableId: TableId | null
} & SharedCartViewProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
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

    try {
      await using run = appRun()
      await run.orThrow(cancelBill(billId))
      await navigate({ to: "/" })
    } catch (error) {
      console.error("Failed to discard cart", error)
      toast.error(t("settings.saveFailed"))
    }
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

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("bill.search")}
            placeholder={t("bill.search")}
            value={search}
            autoComplete="off"
            className="h-12 border-none bg-card pl-12 text-base"
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
        {availableCategories.length > 0 && (
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
      <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {currencyItems.length === 0 ? (
          <BillEmptyCatalog />
        ) : filteredItems.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground">
            {t("bill.emptySearch")}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 pb-4">
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

      <div
        className={cn(
          "grid shrink-0 overflow-hidden transition-[grid-template-rows] duration-300 ease-out",
          billId === undefined ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
      >
        <div className="min-h-0 pt-2">
          <Collapsible open={summaryOpen} onOpenChange={onSummaryOpenChange}>
            <Card size="sm" className="bg-card">
              <CollapsibleTrigger
                data-testid="bill-summary-trigger"
                className="w-full text-left"
                disabled={summaries.length === 0 && !cart.canUndo}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                    <ShoppingBag className="size-4" />
                    {t("bill.itemsCount", { value: itemCount })}
                  </CardTitle>
                  <CardAction className="flex items-center gap-2 text-base font-semibold">
                    {formatMoney({ value: totalAmount, currency }, locale)}
                    <ChevronDown
                      className={
                        summaryOpen
                          ? "size-4 transition-transform duration-200"
                          : "size-4 rotate-180 transition-transform duration-200"
                      }
                    />
                  </CardAction>
                </CardHeader>
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
                <div className="flex min-h-0 flex-col gap-4 px-4">
                  <div className="max-h-48 overflow-y-auto">
                    <div className="flex flex-col divide-y">
                      {summaries.map((summary) => (
                        <div
                          key={summary.id}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {summary.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {summary.quantity} ×{" "}
                              {formatMoney(
                                {
                                  value: NonNegativeInteger(
                                    summary.totalAmount / summary.quantity
                                  ),
                                  currency: summary.currency,
                                },
                                locale
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {formatMoney(
                              {
                                value: summary.totalAmount,
                                currency: summary.currency,
                              },
                              locale
                            )}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("bill.summary.removeLine.aria", {
                              name: summary.name,
                            })}
                            disabled={cart.pending}
                            onClick={() => {
                              void cart.removeLine(summary).then(() => {
                                showUndoToast(
                                  t("bill.summary.removeLine.toast", {
                                    name: summary.name,
                                  })
                                )
                              })
                            }}
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      disabled={!cart.canUndo || cart.pending}
                      onClick={() => void cart.undo()}
                    >
                      <Undo2 data-icon="inline-start" />
                      {t("bill.summary.undo")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!cart.canRedo || cart.pending}
                      onClick={() => void cart.redo()}
                    >
                      <Redo2 data-icon="inline-start" />
                      {t("bill.summary.redo")}
                    </Button>
                    <Button
                      variant="outline"
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
            </Card>
          </Collapsible>

          <div className="flex items-center gap-2 pt-4">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full text-destructive"
              disabled={billId === undefined}
              aria-label={t("bill.discard")}
              onClick={() => setDiscardDialogOpen(true)}
            >
              <Trash2Icon />
            </Button>
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-full text-base font-bold"
              aria-label={t("bill.table.aria")}
              onClick={() => setTablePickerOpen(true)}
            >
              <Table2 data-icon="inline-start" />
              {currentTable?.name ?? t("bill.table.assign")}
            </Button>
            <Button
              variant="default"
              className="h-12 flex-1 rounded-full text-base font-bold"
              disabled={
                billId === undefined || summaries.length === 0 || chargePending
              }
              onClick={() => void handleCharge()}
            >
              {t("home.pay")}
            </Button>
          </div>

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
        </div>
      </div>
    </>
  )
}

function BillEmptyCatalog() {
  const { t } = useTranslation()

  return (
    <div className="mt-10 flex flex-col items-center gap-3 text-center">
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
  const { t } = useTranslation()
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false)
  const [quantityInput, setQuantityInput] = useState("")
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

  const parsedQuantityInput = Number(quantityInput)
  const canConfirmQuantity =
    Number.isInteger(parsedQuantityInput) && parsedQuantityInput > 0

  const handleConfirmQuantity = () => {
    if (!canConfirmQuantity) return

    onAddQuantity(PositiveNumber(parsedQuantityInput))
    setQuantityDialogOpen(false)
  }

  return (
    <Card
      className={cn(
        "relative gap-3 p-4",
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
      <div
        className={cn(
          "flex items-center justify-end gap-1 self-end rounded-full bg-muted p-1",
          inCart && "bg-primary-foreground/15"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label={t("bill.brick.remove.aria", {
            name: catalogItem.name,
          })}
          disabled={disabled || quantity === 0}
          onClick={() => {
            if (latestSummary !== undefined) onRemove(latestSummary)
          }}
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 min-w-6 rounded-full px-2 font-semibold tabular-nums"
          aria-label={t("bill.brick.quantity.trigger.aria", {
            name: catalogItem.name,
          })}
          disabled={disabled}
          onClick={() => {
            setQuantityInput(quantity > 0 ? String(quantity) : "")
            setQuantityDialogOpen(true)
          }}
        >
          {quantity}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label={t("bill.brick.add.aria", { name: catalogItem.name })}
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus />
        </Button>
      </div>

      <Dialog open={quantityDialogOpen} onOpenChange={setQuantityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catalogItem.name}</DialogTitle>
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
    </Card>
  )
}
