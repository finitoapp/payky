import { formatMoney } from "@payky/app-shared/format-money"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { billByIdQuery } from "@payky/core/modules/bill/bill-queries"
import { BillId, createRandomBillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import {
  deriveBillSummaryStats,
  getBillLineSummaryUnitAmount,
  getLatestCatalogItemSummary,
} from "@payky/core/modules/bill-line/bill-line-utils"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import { catalogItemsQuery } from "@payky/core/modules/catalog-item/catalog-item-queries"
import { getStaffDisplayName } from "@payky/core/modules/catalog-item/catalog-item-utils"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { type FiatCurrency, Integer } from "@payky/core/modules/shared/schema"
import { Redirect, router, useLocalSearchParams } from "expo-router"
import { Suspense, useMemo, useState } from "react"
import { FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  useBillLineSummaries,
  useBillStatus,
  usePendingPayments,
} from "./use-bill-state.ts"
import { useCartBill } from "./use-cart-bill.ts"

const goHome = () => router.dismissTo("/")

/**
 * Like web's `_terminal/bill` route: a missing `billId` gets a freshly minted
 * one before the page renders (a suspended first render would regenerate it on
 * every retry), and an unparseable one is an "invalid id" page. A well-formed
 * id with no row yet is a new cart, not an error.
 */
export function BillRoute() {
  const { t } = useTranslation()
  const { billId } = useLocalSearchParams<{ billId?: string }>()
  const [mintedId] = useState(createRandomBillId)

  if (billId === undefined || billId === "")
    return (
      <Redirect href={{ pathname: "/bill", params: { billId: mintedId } }} />
    )

  const parsed = BillId.safeParse(billId)
  if (!parsed.success) return <EmptyView message={t("bill.invalidId")} />

  return (
    <Suspense fallback={<LoadingView />}>
      <BillPage billId={parsed.data} />
    </Suspense>
  )
}

function BillPage({ billId }: { readonly billId: BillId }) {
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const [bill] = useEvoluQuery(billByIdQuery(billId)).data
  const summaries = useBillLineSummaries(billId)
  const pendingPaymentIds = usePendingPayments(billId)
  const billStatus = useBillStatus(billId)

  // Web sends a closed bill to the activity detail; native has none yet, so
  // it says so and offers the way home. A cancellation collision (canceled
  // but funded) is resolved from activity/refund, which arrive later.
  if (bill !== undefined && billStatus?.status !== "open")
    return (
      <BillMessage
        message={
          billStatus?.hasCancellationCollision
            ? `${t("bill.collision.title")}. ${t("bill.collision.description")}`
            : t("bill.closed")
        }
      />
    )
  if (pendingPaymentIds.length > 0)
    return <BillLocked paymentIds={pendingPaymentIds} />

  return (
    <BillCart
      billId={billId}
      title={
        bill === undefined
          ? t("bill.title")
          : (bill.label ?? t("bill.list.label", { number: bill.displayNumber }))
      }
      currency={bill?.currency ?? getFiatCurrency(settings)}
      summaries={summaries}
    />
  )
}

function BillMessage({ message }: { readonly message: string }) {
  const { t } = useTranslation()
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <EmptyView message={message} />
      <YStack p="4">
        <AppButton label={t("paymentWait.back")} onPress={goHome} />
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
  title,
  currency,
  summaries,
}: {
  readonly billId: BillId
  readonly title: string
  readonly currency: FiatCurrency
  readonly summaries: ReadonlyArray<BillLineSummary>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const theme = useTheme()
  const { totalAmount, itemCount } = useMemo(
    () => deriveBillSummaryStats(summaries),
    [summaries]
  )
  const cart = useCartBill({ billId, currency })
  const catalogItems = useEvoluQuery(catalogItemsQuery).data
  const catalogItemsById = useMemo(
    () => new Map(catalogItems.map((item) => [item.id, item])),
    [catalogItems]
  )
  const currencyItems = useMemo(
    () => catalogItems.filter((item) => item.currency === currency),
    [catalogItems, currency]
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

      {/* The category filter, search and scan mode arrive with P04/H02. */}
      <FlatList
        style={{ flex: 1 }}
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ gap: 8 }}
        data={currencyItems}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<CatalogEmpty />}
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
