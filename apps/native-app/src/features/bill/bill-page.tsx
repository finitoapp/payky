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
import { Suspense, useDeferredValue, useMemo, useRef, useState } from "react"
import { FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import { useCreateTerminalPayment } from "../../hooks/use-create-terminal-payment.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { BillCancellationCollisionActions } from "../shared/bill-cancellation-collision-actions.tsx"
import { CategoryFilterBar } from "../shared/category-filter-bar.tsx"
import {
  useBillLineSummaries,
  useBillStatus,
  usePendingPayments,
} from "../shared/use-bill-state.ts"
import { WarningPanel } from "../shared/warning-panel.tsx"
import { AssignTableDialog } from "./assign-table-dialog.tsx"
import { BillScanView } from "./bill-scan-view.tsx"
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
  const { billId, tableId } = useLocalSearchParams<{
    billId?: string
    tableId?: string
  }>()
  const [mintedId] = useState(createRandomBillId)

  if (billId === undefined || billId === "")
    return (
      <Redirect href={{ pathname: "/bill", params: { billId: mintedId } }} />
    )

  const parsed = BillId.safeParse(billId)
  if (!parsed.success) return <EmptyView message={t("bill.invalidId")} />

  return (
    <Suspense fallback={<LoadingView />}>
      <BillPage
        billId={parsed.data}
        // A broken `tableId` is only a lost preselection, as on web.
        initialTableId={
          tableId === undefined ? undefined : TableId.safeParse(tableId).data
        }
      />
    </Suspense>
  )
}

function BillPage({
  billId,
  initialTableId,
}: {
  readonly billId: BillId
  readonly initialTableId: TableId | undefined
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
        <AppButton
          variant="secondary"
          label={t("paymentDetail.bill.open")}
          onPress={() =>
            router.push({
              pathname: "/activity/bills/[billId]",
              params: { billId },
            })
          }
        />
        <AppButton label={t("paymentWait.back")} onPress={goHome} />
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
        <WarningPanel title={t("bill.collision.title")}>
          <Text>{t("bill.collision.description")}</Text>
        </WarningPanel>
        <Text fontSize={28} fontWeight="600" text="center">
          {formatMoney(
            { value: deriveBillSummaryTotal(summaries), currency },
            locale
          )}
        </Text>
        {paymentIds.map((paymentId, index) => (
          <AppButton
            key={paymentId}
            variant="secondary"
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
          <AppButton
            key={paymentId}
            variant="secondary"
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
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const theme = useTheme()
  const { totalAmount, itemCount } = useMemo(
    () => deriveBillSummaryStats(summaries),
    [summaries]
  )
  const cart = useCartBill({ billId, currency, tableId, onTableSeedChange })
  const toast = useToast()
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [lastScanned, setLastScanned] = useState<CatalogItemRow | null>(null)
  const [collisionCandidates, setCollisionCandidates] = useState<
    ReadonlyArray<CatalogItemRow>
  >([])
  const [splitOpen, setSplitOpen] = useState(false)
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
  // A code matching one item adds it, several ask which one. An unknown code
  // only says so until the create-from-scan flow lands.
  const handleScan = (rawValue: string) => {
    const matches = findCatalogItemsByScanCode(currencyItems, rawValue)
    const [first] = matches
    if (first === undefined)
      toast.error(t("bill.scan.unknown.description", { code: rawValue }))
    else if (matches.length > 1) setCollisionCandidates(matches)
    else addScanned(first)
  }
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
      style={{
        flex: 1,
        padding: 16,
        gap: 12,
        backgroundColor: theme.background.val,
      }}
    >
      <Text fontSize={24} fontWeight="600" accessibilityRole="header">
        {title}
      </Text>

      {tableName === undefined ? null : (
        <Text color="muted-foreground">{tableName}</Text>
      )}

      <AppButton
        variant={scanMode ? "primary" : "secondary"}
        label={t("bill.scan.toggle.aria")}
        onPress={() => setScanMode((on) => !on)}
      />
      {/* Search arrives later. */}
      <CategoryFilterBar
        categories={categories}
        usedCategoryIds={usedCategoryIds}
        value={categoryFilter}
        onValueChange={setCategoryFilter}
        allLabel={t("bill.category.all")}
        uncategorizedLabel={t("bill.category.uncategorized")}
        extraOptions={inBillFilterOptions}
      />
      {scanMode ? (
        <BillScanView
          paused={collisionCandidates.length > 0}
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
          contentContainerStyle={{ gap: 8 }}
          data={gridItems}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            currencyItems.length === 0 ? (
              <CatalogEmpty />
            ) : (
              <EmptyView
                message={t(
                  categoryFilter === "inBill"
                    ? "bill.filter.inBill.empty"
                    : "bill.emptySearch"
                )}
              />
            )
          }
          renderItem={({ item }) => (
            <ItemBrick
              catalogItem={item}
              summaries={summaries}
              locale={locale}
              onAdd={() => void cart.addOne(item)}
              onRemove={(summary) => void cart.removeOne(summary)}
            />
          )}
        />
      )}
      <ScanCodeCollisionDialog
        candidates={collisionCandidates}
        onClose={() => setCollisionCandidates([])}
        onSelect={(item) => {
          setCollisionCandidates([])
          addScanned(item)
        }}
      />

      <FlatList
        style={{ flexGrow: 0, maxHeight: 180 }}
        data={summaries}
        keyExtractor={(summary) => summary.id}
        ListEmptyComponent={<EmptyView message={t("bill.summary.empty")} />}
        renderItem={({ item: summary }) => (
          <SummaryRow
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
        )}
      />

      <YStack gap="2">
        <Text color="muted-foreground">
          {t("bill.summary.total")} ·{" "}
          {t("bill.itemsCount", { value: itemCount })}
        </Text>
        <Text fontSize={32} fontWeight="600">
          {formatMoney({ value: totalAmount, currency }, locale)}
        </Text>
        <AppButton
          variant="secondary"
          label={tableName ?? t("bill.table.assign")}
          onPress={() => setTablePickerOpen(true)}
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
        <AppButton
          variant="secondary"
          label={t("bill.split.button.aria")}
          disabled={summaries.length === 0 || cart.pending || split.pending}
          onPress={() => setSplitOpen(true)}
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
        <AppButton
          label={t("home.pay")}
          pending={chargePending}
          disabled={summaries.length === 0}
          onPress={() => void charge()}
        />
      </YStack>
    </SafeAreaView>
  )
}

function SummaryRow({
  summary,
  locale,
  disabled,
  catalogItem,
  onAddOne,
  onRemoveOne,
  onRemove,
}: {
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
      py="2"
      gap="2"
      items="center"
      borderBottomWidth={1}
      borderColor="border-color"
    >
      <YStack flex={1}>
        <Text fontWeight="600" numberOfLines={1}>
          {summary.name}
        </Text>
        {/* A single piece costs what the line total already says. */}
        {summary.quantity === 1 ? null : (
          <Text color="muted-foreground">
            {summary.quantity} × {money(getBillLineSummaryUnitAmount(summary))}
          </Text>
        )}
      </YStack>
      {/* No `disabled` on "−"/"+": the cart queues taps, and a button disabled mid-tap drops one. */}
      <RoundButton
        label={t("bill.summary.decrement.aria", { name: summary.name })}
        symbol="−"
        onPress={onRemoveOne}
      />
      <Text minW={28} text="center" fontWeight="600">
        {summary.quantity}
      </Text>
      <RoundButton
        label={t("bill.summary.increment.aria", { name: summary.name })}
        symbol="+"
        disabled={catalogItem === undefined}
        onPress={() => {
          if (catalogItem !== undefined) onAddOne(catalogItem)
        }}
      />
      <Text minW={72} text="right" fontWeight="600">
        {money(summary.totalAmount)}
      </Text>
      <RoundButton
        label={t("bill.summary.removeLine.aria", { name: summary.name })}
        symbol="×"
        disabled={disabled}
        onPress={onRemove}
      />
    </XStack>
  )
}

function RoundButton({
  label,
  symbol,
  disabled = false,
  onPress,
}: {
  readonly label: string
  readonly symbol: string
  readonly disabled?: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text fontSize={20}>{symbol}</Text>
    </Pressable>
  )
}

/**
 * Items are created in settings (web `/settings/items/new`); native has no
 * catalog editing until C12, so an empty catalog only explains itself.
 */
function CatalogEmpty() {
  const { t } = useTranslation()
  return (
    <YStack items="center" gap="2" p="4">
      <Text fontWeight="600">{t("settings.items.empty.title")}</Text>
      <Text color="muted-foreground" text="center">
        {t("settings.items.empty.description")}
      </Text>
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

  return (
    <YStack
      flex={1}
      minH={96}
      borderWidth={1}
      borderColor="border-color"
      rounded="lg"
      overflow="hidden"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("bill.brick.add.aria", { name })}
        onPress={onAdd}
        style={{ flex: 1, padding: 12 }}
      >
        <Text fontWeight="600">
          {quantity > 0 ? `${quantity} × ` : ""}
          {name}
        </Text>
        <Text color="muted-foreground">
          {formatMoney(
            { value: catalogItem.unitAmount, currency: catalogItem.currency },
            locale
          )}
        </Text>
      </Pressable>
      {quantity > 0 && latestSummary !== undefined ? (
        <XStack justify="flex-end" px="2" pb="2">
          <RoundButton
            label={t("bill.brick.remove.aria", { name })}
            symbol="−"
            onPress={() => onRemove(latestSummary)}
          />
        </XStack>
      ) : null}
    </YStack>
  )
}
