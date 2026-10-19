import { sqliteTrue } from "@evolu/common"
import { formatMoney } from "@payky/app-shared/format-money"
import { useRedirectIfClosedOnOpen } from "@payky/app-shared/use-redirect-if-closed-on-open"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { claimedPaymentsByBillIdQuery } from "@payky/core/modules/bill/bill-coverage-queries"
import { billByIdQuery } from "@payky/core/modules/bill/bill-queries"
import { BillId, createRandomBillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import {
  deriveBillSummaryStats,
  deriveBillSummaryTotal,
  getBillLineSummaryUnitAmount,
  getLatestCatalogItemSummary,
} from "@payky/core/modules/bill-line/bill-line-utils"
import { catalogCategoriesQuery } from "@payky/core/modules/catalog-category/catalog-category-queries"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import {
  catalogItemsPageQuery,
  catalogItemsQuery,
} from "@payky/core/modules/catalog-item/catalog-item-queries"
import type { CategoryFilter } from "@payky/core/modules/catalog-item/catalog-item-types"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@payky/core/modules/catalog-item/catalog-item-utils"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import {
  type FiatCurrency,
  Integer,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import { TableId } from "@payky/core/modules/table/table-types"
import { Redirect, router, useLocalSearchParams } from "expo-router"
import ChevronDown from "lucide-react-native/icons/chevron-down"
import Minus from "lucide-react-native/icons/minus"
import Plus from "lucide-react-native/icons/plus"
import ScanLine from "lucide-react-native/icons/scan-line"
import ShoppingBag from "lucide-react-native/icons/shopping-bag"
import Split from "lucide-react-native/icons/split"
import Table2 from "lucide-react-native/icons/table-2"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import X from "lucide-react-native/icons/x"
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { FlatList, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, View, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../components/fade-header.tsx"
import { RouteMessage } from "../../components/route-message.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../components/ui/alert.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Card, CardContent } from "../../components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { useConfirm } from "../../hooks/use-confirm.ts"
import { useCreateTerminalPayment } from "../../hooks/use-create-terminal-payment.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../hooks/use-hardware-scanner.ts"
import { useIsConfirmOpen } from "../../hooks/use-is-confirm-open.ts"
import { useProductLookup } from "../../hooks/use-product-lookup.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { fontSize, fontWeight, radius } from "../../theme/tokens.ts"
import { BillCancellationCollisionActions } from "../shared/bill-cancellation-collision-actions.tsx"
import { CategoryFilterBar } from "../shared/category-filter-bar.tsx"
import {
  useBillLineSummaries,
  useBillStatus,
  usePendingPayments,
} from "../shared/use-bill-state.ts"
import { AssignTableDialog } from "./assign-table-dialog.tsx"
import { BillScanView } from "./bill-scan-view.tsx"
import { CreateCatalogItemDialog } from "./create-catalog-item-dialog.tsx"
import { ScanCodeCollisionDialog } from "./scan-code-collision-dialog.tsx"
import { SplitBillDialog } from "./split-bill-dialog.tsx"
import { useCartBill } from "./use-cart-bill.ts"
import { useSplitBill } from "./use-split-bill.ts"

/** The category filters, plus "on the bill": only what the bill holds. */
type BillItemFilter = CategoryFilter | "inBill"

const goHome = () => router.dismissTo("/")

/**
 * Like web's `_terminal/bill` route: a missing `billId` gets a freshly minted
 * one before the page renders (a suspended first render would regenerate it on
 * every retry), and an unparseable one is an "invalid id" page. A well-formed
 * id with no row yet is a new cart, not an error.
 */
export function BillRoute() {
  const { t } = useTranslation()
  const { billId, tableId, scan } = useLocalSearchParams<{
    billId?: string
    tableId?: string
    scan?: string
  }>()
  const [mintedId] = useState(createRandomBillId)

  if (billId === undefined || billId === "")
    return (
      <Redirect href={{ pathname: "/bill", params: { billId: mintedId } }} />
    )

  const parsed = BillId.safeParse(billId)
  if (!parsed.success) return <RouteMessage>{t("bill.invalidId")}</RouteMessage>

  return (
    <Suspense fallback={<LoadingView />}>
      <BillPage
        billId={parsed.data}
        // A broken `tableId` is only a lost preselection, as on web.
        initialTableId={
          tableId === undefined ? undefined : TableId.safeParse(tableId).data
        }
        initialScanCode={scan === "" ? undefined : scan}
      />
    </Suspense>
  )
}

function BillPage({
  billId,
  initialTableId,
  initialScanCode,
}: {
  readonly billId: BillId
  readonly initialTableId: TableId | undefined
  /** A code scanned on the home screen, which opened this bill to add it. */
  readonly initialScanCode: string | undefined
}) {
  const { t } = useTranslation()
  // Only meaningful before the bill row exists: it seeds the table the lazily
  // created row is assigned to. Afterwards `bill.tableId` is the truth.
  const [pendingTableId, setPendingTableId] = useState<TableId | null>(
    initialTableId ?? null
  )
  const tables = useEvoluQuery(tablesQuery).data
  const [settings] = useEvoluQuery(settingsQuery).data
  const [bill] = useEvoluQuery(billByIdQuery(billId)).data
  const summaries = useBillLineSummaries(billId)
  const pendingPaymentIds = usePendingPayments(billId)
  const billStatus = useBillStatus(billId)

  // As web: a bill that is already closed when opened (Back, a stale link)
  // goes to its detail, which `sell` alone cannot read, so the PIN gate asks.
  // Decided once, so a bill paid while the cart is open still shows its
  // message. A cancellation collision (canceled but funded) stays here: it is
  // resolved from activity/refund, which arrive later.
  const closedOnOpen = useRedirectIfClosedOnOpen(
    bill !== undefined &&
      billStatus?.status !== "open" &&
      billStatus?.hasCancellationCollision !== true,
    () =>
      router.replace({
        pathname: "/activity/bills/[billId]",
        params: { billId },
      })
  )
  if (closedOnOpen) return <LoadingView />
  if (bill !== undefined && billStatus?.status !== "open")
    return billStatus?.hasCancellationCollision ? (
      <BillCancellationCollisionMessage
        billId={billId}
        currency={bill.currency}
      />
    ) : (
      <BillMessage billId={billId} message={t("bill.closed")} />
    )
  if (pendingPaymentIds.length > 0)
    return <BillLocked paymentIds={pendingPaymentIds} />

  return (
    <BillCart
      billId={billId}
      tableId={bill === undefined ? pendingTableId : bill.tableId}
      tableName={
        tables.find(
          (table) =>
            table.id === (bill === undefined ? pendingTableId : bill.tableId)
        )?.name
      }
      onTableSeedChange={setPendingTableId}
      title={
        bill === undefined
          ? t("bill.title")
          : (bill.label ?? t("bill.list.label", { number: bill.displayNumber }))
      }
      currency={bill?.currency ?? getFiatCurrency(settings)}
      tipsEnabled={settings?.tipsEnabled === sqliteTrue}
      summaries={summaries}
      initialScanCode={initialScanCode}
    />
  )
}

function BillMessage({
  billId,
  message,
}: {
  readonly billId: BillId
  readonly message: string
}) {
  const { t } = useTranslation()
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <EmptyView message={message} />
      <YStack p="4" gap="2">
        <Button
          size="lg"
          variant="outline"
          label={t("paymentDetail.bill.open")}
          onPress={() =>
            router.push({
              pathname: "/activity/bills/[billId]",
              params: { billId },
            })
          }
        />
        <Button size="lg" label={t("paymentWait.back")} onPress={goHome} />
      </YStack>
    </SafeAreaView>
  )
}

/**
 * The bill-level mirror of the payment collision: this bill was discarded, but
 * its payments already cover its total. Shows what is at stake (the total),
 * links to the payments that funded it and offers the two resolving actions,
 * as web's `BillCancellationCollisionMessage`.
 */
function BillCancellationCollisionMessage({
  billId,
  currency,
}: {
  readonly billId: BillId
  readonly currency: FiatCurrency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const summaries = useBillLineSummaries(billId)
  const claimedPayments = useEvoluQuery(
    claimedPaymentsByBillIdQuery(billId)
  ).data
  const paymentIds = useMemo(
    () => [...new Set(claimedPayments.map((payment) => payment.id))],
    [claimedPayments]
  )

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} p="4" gap="3" justify="center">
        <Alert variant="warning" icon={TriangleAlert}>
          <AlertTitle>{t("bill.collision.title")}</AlertTitle>
          <AlertDescription>{t("bill.collision.description")}</AlertDescription>
        </Alert>
        <Text fontSize={28} fontWeight="600" text="center">
          {formatMoney(
            { value: deriveBillSummaryTotal(summaries), currency },
            locale
          )}
        </Text>
        {paymentIds.map((paymentId, index) => (
          <Button
            size="lg"
            key={paymentId}
            variant="outline"
            label={
              paymentIds.length > 1
                ? t("bill.collision.viewPayment.numbered", {
                    number: index + 1,
                  })
                : t("bill.collision.viewPayment")
            }
            onPress={() =>
              router.push({
                pathname: "/activity/[paymentId]",
                params: { paymentId },
              })
            }
          />
        ))}
        <BillCancellationCollisionActions billId={billId} />
      </YStack>
    </SafeAreaView>
  )
}

function BillLocked({
  paymentIds,
}: {
  readonly paymentIds: ReadonlyArray<PaymentId>
}) {
  const { t } = useTranslation()
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <EmptyView message={t("bill.locked")} />
      <YStack p="4" gap="2">
        {paymentIds.map((paymentId, index) => (
          <Button
            size="lg"
            key={paymentId}
            variant="outline"
            label={
              paymentIds.length > 1
                ? t("bill.locked.viewPayment.numbered", { number: index + 1 })
                : t("bill.locked.viewPayment")
            }
            onPress={() =>
              router.push({
                pathname: "/payment/[paymentId]",
                params: { paymentId },
              })
            }
          />
        ))}
      </YStack>
    </SafeAreaView>
  )
}

function BillCart({
  billId,
  tableId,
  tableName,
  onTableSeedChange,
  title,
  currency,
  tipsEnabled,
  summaries,
  initialScanCode,
}: {
  readonly billId: BillId
  readonly tableId: TableId | null
  /** The assigned table's name, when there is one. */
  readonly tableName: string | undefined
  readonly onTableSeedChange: (tableId: TableId | null) => void
  readonly title: string
  readonly currency: FiatCurrency
  readonly tipsEnabled: boolean
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly initialScanCode: string | undefined
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const theme = useTheme()
  const { totalAmount, itemCount } = useMemo(
    () => deriveBillSummaryStats(summaries),
    [summaries]
  )
  const cart = useCartBill({ billId, currency, tableId, onTableSeedChange })
  const confirm = useConfirm()
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [lastScanned, setLastScanned] = useState<CatalogItemRow | null>(null)
  const [collisionCandidates, setCollisionCandidates] = useState<
    ReadonlyArray<CatalogItemRow>
  >([])
  const [createCode, setCreateCode] = useState<string | null>(null)
  // Set as soon as an unknown code is scanned, so the lookup runs while the
  // confirmation is open and the form opens prefilled.
  const [lookupCode, setLookupCode] = useState<string | null>(null)
  const productLookup = useProductLookup(lookupCode)
  const [splitOpen, setSplitOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const split = useSplitBill({
    billId,
    tableId,
    currency,
    onDone: () => setSplitOpen(false),
  })
  const createTerminalPayment = useCreateTerminalPayment()
  // The ref closes the window before `chargePending` re-renders: a second tap
  // would create a second payment (core accepts a bill with a pending one) and
  // lock the cart. Same pairing as the keypad and the tip page.
  const chargePendingRef = useRef(false)
  const [chargePending, setChargePending] = useState(false)

  // The payment's amounts and bill-line snapshot are core's
  // (`createPreparedPayment` with `billId`); this only picks the route.
  const charge = async () => {
    if (summaries.length === 0 || chargePendingRef.current) return
    chargePendingRef.current = true
    setChargePending(true)
    try {
      if (tipsEnabled) {
        router.push({
          pathname: "/payment/tip",
          params: { amount: String(totalAmount), currency, billId },
        })
        return
      }
      await createTerminalPayment({
        amount: totalAmount,
        currency,
        tipAmount: NonNegativeInteger(0),
        billId,
      })
    } finally {
      chargePendingRef.current = false
      setChargePending(false)
    }
  }
  const catalogItems = useEvoluQuery(catalogItemsQuery).data
  const catalogItemsById = useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems]
  )
  const currencyItems = useMemo(
    () => catalogItems.filter((item) => item.currency === currency),
    [catalogItems, currency]
  )
  const categories = useEvoluQuery(catalogCategoriesQuery).data

  const addScanned = (item: CatalogItemRow) => {
    setLastScanned(item)
    void cart.addOne(item)
  }
  const confirmOpen = useIsConfirmOpen()
  const scanDialogOpen =
    collisionCandidates.length > 0 ||
    createCode !== null ||
    confirmOpen ||
    tablePickerOpen ||
    splitOpen
  // A code matching one item adds it, several ask which one, an unknown one
  // offers to create the item (prefilled from the product lookup) and add it.
  const handleScan = async (rawValue: string) => {
    const matches = findCatalogItemsByScanCode(currencyItems, rawValue)
    const [first] = matches
    if (first === undefined) {
      setLookupCode(rawValue)
      const confirmed = await confirm({
        title: t("bill.scan.unknown.title"),
        description: t("bill.scan.unknown.description", { code: rawValue }),
        confirmLabel: t("bill.scan.unknown.create"),
        cancelLabel: t("bill.scan.unknown.cancel"),
      })
      if (confirmed) setCreateCode(rawValue)
      else setLookupCode(null)
    } else if (matches.length > 1) setCollisionCandidates(matches)
    else addScanned(first)
  }
  // At any time, not only in scan mode, as web (scanner/0001).
  useHardwareScanner({
    enabled: !scanDialogOpen,
    onScan: (code) => void handleScan(code),
  })
  // Handled once, then dropped from the route so a return to this bill does
  // not add the item a second time.
  const initialScanHandledRef = useRef(false)
  useEffect(() => {
    if (initialScanCode === undefined || initialScanHandledRef.current) return
    initialScanHandledRef.current = true
    router.setParams({ scan: undefined })
    void handleScan(initialScanCode)
  })
  const usedCategoryIds = useMemo(
    () => new Set(currencyItems.map((item) => item.categoryId)),
    [currencyItems]
  )
  const [categoryFilter, setCategoryFilter] = useState<BillItemFilter>("all")
  const inBillItemIds = useMemo(
    () => [
      ...new Set(
        summaries.flatMap((summary) =>
          summary.catalogItemId !== null && summary.quantity > 0
            ? [summary.catalogItemId]
            : []
        )
      ),
    ],
    [summaries]
  )
  // Deferred, so switching a chip never suspends this screen: a suspend here
  // would bubble to the route's boundary and remount the cart mid-tap.
  const deferredFilter = useDeferredValue(categoryFilter)
  const deferredInBillIds = useDeferredValue(inBillItemIds)
  const gridQuery = useMemo(
    () =>
      catalogItemsPageQuery({
        search: "",
        categoryFilter: deferredFilter === "inBill" ? "all" : deferredFilter,
        currency,
        ...(deferredFilter === "inBill"
          ? { catalogItemIds: deferredInBillIds }
          : {}),
        // The whole catalog keeps each category's items together, as web.
        groupByCategory: deferredFilter === "all",
        // ponytail: no paging, the list is virtualized; raise or page if a
        // catalog ever outgrows this.
        limit: 10_000,
      }),
    [deferredFilter, deferredInBillIds, currency]
  )
  const gridItems = useEvoluQuery(gridQuery).data
  const inBillFilterOptions = useMemo(
    () => [{ value: "inBill" as const, label: t("bill.filter.inBill") }],
    [t]
  )

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{
        flex: 1,
        paddingHorizontal: 12,
        backgroundColor: theme.background.val,
      }}
    >
      <FadeHeader title={title} subtitle={tableName} />

      <XStack mt={8} gap={8} items="center">
        <YStack flex={1} minW={0}>
          {scanMode ? null : (
            <CategoryFilterBar
              categories={categories}
              usedCategoryIds={usedCategoryIds}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              allLabel={t("bill.category.all")}
              uncategorizedLabel={t("bill.category.uncategorized")}
              extraOptions={inBillFilterOptions}
            />
          )}
        </YStack>
        <Button
          variant={scanMode ? "default" : "outline"}
          size="icon"
          w={48}
          h={48}
          shrink={0}
          iconStart={ScanLine}
          accessibilityLabel={t("bill.scan.toggle.aria")}
          accessibilityState={{ selected: scanMode }}
          onPress={() => setScanMode((on) => !on)}
        />
      </XStack>

      <YStack flex={1} mt={8}>
        {scanMode ? (
          <BillScanView
            paused={scanDialogOpen}
            onScan={handleScan}
            lastScanned={
              lastScanned === null ? null : (
                <ItemBrick
                  catalogItem={lastScanned}
                  summaries={summaries}
                  locale={locale}
                  onAdd={() => void cart.addOne(lastScanned)}
                  onRemove={(summary) => void cart.removeOne(summary)}
                />
              )
            }
          />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
            data={gridItems}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              currencyItems.length === 0 ? (
                <CatalogEmpty />
              ) : (
                <Text mt={40} color="muted-foreground" text="center">
                  {t(
                    categoryFilter === "inBill"
                      ? "bill.filter.inBill.empty"
                      : "bill.emptySearch"
                  )}
                </Text>
              )
            }
            renderItem={({ item }) => (
              // Half the row at most, so an odd last brick keeps its column.
              <View flex={1} maxW="50%">
                <ItemBrick
                  catalogItem={item}
                  summaries={summaries}
                  locale={locale}
                  onAdd={() => void cart.addOne(item)}
                  onRemove={(summary) => void cart.removeOne(summary)}
                />
              </View>
            )}
          />
        )}
      </YStack>
      <CreateCatalogItemDialog
        scanCode={createCode}
        productLookup={productLookup}
        currency={currency}
        onClose={() => {
          setCreateCode(null)
          setLookupCode(null)
        }}
        onCreated={(item) => {
          setCreateCode(null)
          setLookupCode(null)
          addScanned(item)
        }}
      />
      <ScanCodeCollisionDialog
        candidates={collisionCandidates}
        onClose={() => setCollisionCandidates([])}
        onSelect={(item) => {
          setCollisionCandidates([])
          addScanned(item)
        }}
      />
      <AssignTableDialog
        open={tablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        billId={billId}
        currentTableId={tableId}
        onAssign={(nextTableId) => {
          setTablePickerOpen(false)
          void cart.assignTable(nextTableId)
        }}
      />
      <SplitBillDialog
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        billId={billId}
        summaries={summaries}
        currency={currency}
        pending={split.pending}
        onConfirm={(input) => void split.split(input)}
      />

      {/* The bottom panel: the bill's summary, collapsed to its total. */}
      <Card
        mx={-12}
        py={0}
        gap={0}
        borderBottomWidth={0}
        borderBottomLeftRadius={0}
        borderBottomRightRadius={0}
      >
        <SafeAreaView edges={["bottom"]}>
          <CardContent pb={16}>
            <Collapsible
              // Closes itself when the last line goes, as its trigger is then off.
              open={summaryOpen && summaries.length > 0}
              onOpenChange={setSummaryOpen}
            >
              <CollapsibleTrigger pt={16} disabled={summaries.length === 0}>
                <XStack items="center" justify="space-between" gap={8}>
                  <XStack items="center" gap={8}>
                    <Icon icon={ShoppingBag} color="muted-foreground" />
                    <Text fontSize={fontSize.base} color="muted-foreground">
                      {t("bill.itemsCount", { value: itemCount })}
                    </Text>
                  </XStack>
                  <XStack items="center" gap={8}>
                    <Text
                      fontSize={fontSize.base}
                      fontWeight={fontWeight.semibold}
                      fontVariant={["tabular-nums"]}
                    >
                      {formatMoney({ value: totalAmount, currency }, locale)}
                    </Text>
                    <View rotate={summaryOpen ? "0deg" : "180deg"}>
                      <Icon icon={ChevronDown} />
                    </View>
                  </XStack>
                </XStack>
              </CollapsibleTrigger>
              <CollapsibleContent pt={16}>
                <ScrollView style={{ maxHeight: 192 }}>
                  {summaries.map((summary, index) => (
                    <SummaryRow
                      key={summary.id}
                      first={index === 0}
                      summary={summary}
                      locale={locale}
                      disabled={cart.pending}
                      catalogItem={
                        summary.catalogItemId === null
                          ? undefined
                          : catalogItemsById.get(summary.catalogItemId)
                      }
                      onAddOne={(catalogItem) => void cart.addOne(catalogItem)}
                      onRemoveOne={() => void cart.removeOne(summary)}
                      onRemove={() => void cart.removeLine(summary)}
                    />
                  ))}
                </ScrollView>
              </CollapsibleContent>
            </Collapsible>
            <XStack items="center" gap={8} pt={16}>
              <Button
                variant="outline"
                size="icon"
                w={48}
                h={48}
                shrink={0}
                iconStart={Split}
                accessibilityLabel={t("bill.split.button.aria")}
                disabled={
                  summaries.length === 0 || cart.pending || split.pending
                }
                onPress={() => setSplitOpen(true)}
              />
              <Button
                variant="outline"
                flex={1}
                h={48}
                iconStart={Table2}
                accessibilityLabel={t("bill.table.aria")}
                label={tableName ?? t("bill.table.assign")}
                onPress={() => setTablePickerOpen(true)}
              />
              <Button
                flex={1}
                h={48}
                accessibilityLabel={t("home.pay")}
                pending={chargePending}
                disabled={summaries.length === 0}
                onPress={() => void charge()}
              >
                <Text
                  fontSize={fontSize.sm}
                  fontWeight={fontWeight.bold}
                  color="primary-foreground"
                >
                  {t("home.pay")}
                </Text>
              </Button>
            </XStack>
          </CardContent>
        </SafeAreaView>
      </Card>
    </SafeAreaView>
  )
}

function SummaryRow({
  first,
  summary,
  locale,
  disabled,
  catalogItem,
  onAddOne,
  onRemoveOne,
  onRemove,
}: {
  readonly first: boolean
  readonly summary: BillLineSummary
  readonly locale: string
  readonly disabled: boolean
  /** The line's catalog item, when it still exists to add another of. */
  readonly catalogItem: CatalogItemRow | undefined
  readonly onAddOne: (catalogItem: CatalogItemRow) => void
  readonly onRemoveOne: () => void
  readonly onRemove: () => void
}) {
  const { t } = useTranslation()
  const money = (value: number) =>
    formatMoney({ value: Integer(value), currency: summary.currency }, locale)

  return (
    <XStack
      py={4}
      gap={8}
      items="center"
      justify="space-between"
      borderTopWidth={first ? 0 : 1}
      borderColor="border-color"
    >
      <YStack flex={1} minW={0}>
        <Text
          fontSize={fontSize.sm}
          fontWeight={fontWeight.medium}
          numberOfLines={1}
        >
          {summary.name}
        </Text>
        {/* A single piece costs what the line total already says. */}
        {summary.quantity === 1 ? null : (
          <Text
            fontSize={fontSize.xs}
            color="muted-foreground"
            fontVariant={["tabular-nums"]}
          >
            {summary.quantity} × {money(getBillLineSummaryUnitAmount(summary))}
          </Text>
        )}
      </YStack>
      {/* No `disabled` on "−"/"+": the cart queues taps, and a button disabled mid-tap drops one. */}
      <XStack
        shrink={0}
        items="center"
        gap={2}
        rounded={radius.md}
        bg="muted"
        p={2}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          rounded={radius.full}
          iconStart={Minus}
          accessibilityLabel={t("bill.summary.decrement.aria", {
            name: summary.name,
          })}
          onPress={onRemoveOne}
        />
        <Text
          minW={24}
          text="center"
          fontSize={fontSize.sm}
          fontWeight={fontWeight.semibold}
          fontVariant={["tabular-nums"]}
        >
          {summary.quantity}
        </Text>
        <Button
          variant="ghost"
          size="icon-sm"
          rounded={radius.full}
          iconStart={Plus}
          accessibilityLabel={t("bill.summary.increment.aria", {
            name: summary.name,
          })}
          disabled={catalogItem === undefined}
          onPress={() => {
            if (catalogItem !== undefined) onAddOne(catalogItem)
          }}
        />
      </XStack>
      <Text
        minW={80}
        text="right"
        fontSize={fontSize.sm}
        fontWeight={fontWeight.semibold}
        fontVariant={["tabular-nums"]}
      >
        {money(summary.totalAmount)}
      </Text>
      <Button
        variant="ghost"
        size="icon-sm"
        iconStart={X}
        accessibilityLabel={t("bill.summary.removeLine.aria", {
          name: summary.name,
        })}
        disabled={disabled}
        onPress={onRemove}
      />
    </XStack>
  )
}

/** As web's `BillEmptyCatalog`: what is missing and the way to add it. */
function CatalogEmpty() {
  const { t } = useTranslation()
  return (
    <YStack items="center" gap={12}>
      <Text
        fontSize={fontSize.lg}
        fontWeight={fontWeight.semibold}
        text="center"
      >
        {t("settings.items.empty.title")}
      </Text>
      <Text
        maxW={288}
        fontSize={fontSize.sm}
        color="muted-foreground"
        text="center"
      >
        {t("settings.items.empty.description")}
      </Text>
      <Button
        variant="outline"
        label={t("settings.items.add")}
        onPress={() => router.push("/settings/items/new")}
      />
    </YStack>
  )
}

/**
 * A tap anywhere on the tile adds one, as on a till. The brick has no
 * `disabled`: the cart queues taps, and a button disabled mid-tap drops one.
 */
function ItemBrick({
  catalogItem,
  summaries,
  locale,
  onAdd,
  onRemove,
}: {
  readonly catalogItem: CatalogItemRow
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly locale: string
  readonly onAdd: () => void
  readonly onRemove: (summary: BillLineSummary) => void
}) {
  const { t } = useTranslation()
  const name = getStaffDisplayName(catalogItem)
  const quantity = summaries.reduce(
    (sum, summary) =>
      summary.catalogItemId === catalogItem.id ? sum + summary.quantity : sum,
    0
  )
  const latestSummary = getLatestCatalogItemSummary(summaries, catalogItem.id)

  const inCart = quantity > 0

  return (
    <Card flex={1} p={12} gap={4} bg={inCart ? "primary-15" : "card"}>
      {/*
       * A tap anywhere on the tile adds one, as on a till; the corner
       * controls above it are kept in the layout but invisible until the
       * item is on the bill, so the tile does not reflow under the finger.
       */}
      <View
        position="absolute"
        t={0}
        r={0}
        b={0}
        l={0}
        bg="transparent press:card-ring"
        accessibilityRole="button"
        accessibilityLabel={t("bill.brick.add.aria", { name })}
        onPress={onAdd}
      />
      <XStack
        items="flex-start"
        justify="space-between"
        gap={8}
        pointerEvents="box-none"
      >
        <Text
          flex={1}
          pt={2}
          fontWeight={fontWeight.medium}
          pointerEvents="none"
        >
          {name}
        </Text>
        <YStack
          shrink={0}
          h={28}
          minW={28}
          px={8}
          rounded={radius.full}
          bg="primary"
          items="center"
          justify="center"
          opacity={inCart ? 1 : 0}
          pointerEvents="none"
          accessibilityElementsHidden={!inCart}
        >
          <Text
            fontSize={12.8}
            fontWeight={fontWeight.bold}
            fontVariant={["tabular-nums"]}
            color="primary-foreground"
          >
            {quantity}
          </Text>
        </YStack>
      </XStack>
      <XStack
        items="flex-end"
        justify="space-between"
        gap={8}
        pointerEvents="box-none"
      >
        <Text
          pb={4}
          fontWeight={fontWeight.semibold}
          color="foreground-70"
          fontVariant={["tabular-nums"]}
          pointerEvents="none"
        >
          {formatMoney(
            { value: catalogItem.unitAmount, currency: catalogItem.currency },
            locale
          )}
        </Text>
        <Button
          variant="secondary"
          size="icon"
          w={40}
          h={40}
          shrink={0}
          rounded={radius.full}
          iconStart={Minus}
          accessibilityLabel={t("bill.brick.remove.aria", { name })}
          opacity={inCart ? 1 : 0}
          disabled={!inCart}
          onPress={() => {
            if (latestSummary !== undefined) onRemove(latestSummary)
          }}
        />
      </XStack>
    </Card>
  )
}
