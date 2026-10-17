import { formatMoney } from "@payky/app-shared/format-money"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { billByIdQuery } from "@payky/core/modules/bill/bill-queries"
import { BillId, createRandomBillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import {
  deriveBillSummaryStats,
  getBillLineSummaryUnitAmount,
} from "@payky/core/modules/bill-line/bill-line-utils"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { Redirect, router, useLocalSearchParams } from "expo-router"
import { Suspense, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  useBillLineSummaries,
  useBillStatus,
  usePendingPayments,
} from "./use-bill-state.ts"

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
  title,
  currency,
  summaries,
}: {
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

      <FlatList
        style={{ flex: 1 }}
        data={summaries}
        keyExtractor={(summary) => summary.id}
        ListEmptyComponent={<EmptyView message={t("bill.summary.empty")} />}
        renderItem={({ item: summary }) => (
          <SummaryRow summary={summary} locale={locale} />
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
}: {
  readonly summary: BillLineSummary
  readonly locale: string
}) {
  return (
    <YStack py="2" borderBottomWidth={1} borderColor="border-color">
      <Text fontWeight="600">{summary.name}</Text>
      <Text color="muted-foreground">
        {summary.quantity === 1
          ? formatMoney(
              { value: summary.totalAmount, currency: summary.currency },
              locale
            )
          : `${summary.quantity} × ${formatMoney(
              {
                value: getBillLineSummaryUnitAmount(summary),
                currency: summary.currency,
              },
              locale
            )} = ${formatMoney(
              { value: summary.totalAmount, currency: summary.currency },
              locale
            )}`}
      </Text>
    </YStack>
  )
}
