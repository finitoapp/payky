import type { InferRow } from "@evolu/common"
import { refundBadgeLabel } from "@payky/app-shared/activity-history"
import {
  billStatusLabelKey,
  paymentStatusLabelKey,
} from "@payky/app-shared/activity-labels"
import { formatDateTime } from "@payky/app-shared/format-date"
import { formatMoney } from "@payky/app-shared/format-money"
import { useNow } from "@payky/app-shared/use-now"
import { billByIdQuery } from "@payky/core/modules/bill/bill-queries"
import { BillId, type BillStatus } from "@payky/core/modules/bill/bill-types"
import {
  calculateTaxRecap,
  hasTaxableLines,
} from "@payky/core/modules/bill-line/bill-line-tax-utils"
import { deriveBillSummaryTotal } from "@payky/core/modules/bill-line/bill-line-utils"
import { paymentsWithClaimsByBillIdQuery } from "@payky/core/modules/payment/payment-queries"
import {
  derivePaymentHasCancellationCollision,
  derivePaymentStatus,
} from "@payky/core/modules/payment/payment-status-utils"
import { refundSummariesByBillIdQuery } from "@payky/core/modules/refund/refund-queries"
import {
  type PaymentRefundSummary,
  summarizeRefundsByPayment,
} from "@payky/core/modules/refund/refund-utils"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import { taxRatesQuery } from "@payky/core/modules/tax-rate/tax-rate-queries"
import { router, useLocalSearchParams } from "expo-router"
import { Suspense } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { CollisionAlert } from "../../components/collision-alert.tsx"
import { DetailRow } from "../../components/detail-row.tsx"
import { NotFoundCard } from "../../components/not-found-card.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { BillCancellationCollisionActions } from "../shared/bill-cancellation-collision-actions.tsx"
import { TaxRecap } from "../shared/tax-recap.tsx"
import {
  useBillLineSummaries,
  useBillStatus,
} from "../shared/use-bill-state.ts"
import {
  paymentMethodsText,
  StatusDot,
  type StatusTone,
} from "./activity-parts.tsx"
import {
  BillCoverageWarning,
  BillLines,
  Card,
  DetailScreen,
  OptionalRow,
  paymentStatusTone,
  StatusBadge,
  Technical,
} from "./detail-parts.tsx"
import { useBillCoverage } from "./use-bill-detail-data.ts"

type BillPaymentRow = InferRow<
  ReturnType<typeof paymentsWithClaimsByBillIdQuery>
>

const billStatusTone = {
  open: "warning",
  closed: "success",
  canceled: "danger",
} as const satisfies Record<BillStatus, StatusTone>

/** `/activity/bills/[billId]`: one bill, read-only. */
export function BillDetailPage() {
  const { t } = useTranslation()
  const { billId } = useLocalSearchParams<{ billId: string }>()
  const parsed = BillId.safeParse(billId)

  return (
    <DetailScreen title={t("billDetail.title")}>
      {parsed.success ? (
        <Suspense fallback={<LoadingView />}>
          <BillDetail billId={parsed.data} />
        </Suspense>
      ) : (
        <NotFoundCard messageKey="billDetail.invalidId" />
      )}
    </DetailScreen>
  )
}

function BillDetail({ billId }: { readonly billId: BillId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [bill] = useEvoluQuery(billByIdQuery(billId)).data
  const tables = useEvoluQuery(tablesQuery).data
  const taxRates = useEvoluQuery(taxRatesQuery).data
  const summaries = useBillLineSummaries(billId)
  const billStatus = useBillStatus(billId)
  const { claimedSum, coverage } = useBillCoverage(billId)
  const payments = useEvoluQuery(paymentsWithClaimsByBillIdQuery(billId)).data
  const refunds = useEvoluQuery(refundSummariesByBillIdQuery(billId)).data
  const refundsByPayment = summarizeRefundsByPayment(refunds)

  // A deleted or never-synced id: the same page, not an error.
  if (bill === undefined || billStatus === undefined)
    return <NotFoundCard messageKey="billDetail.notFound" />

  const table = tables.find((candidate) => candidate.id === bill.tableId)
  const totalAmount = deriveBillSummaryTotal(summaries)
  const taxRecapRows = calculateTaxRecap(summaries, taxRates)
  const closedOrCanceled =
    billStatus.status === "closed" && bill.closedAt !== null
      ? t("billDetail.closedAtValue", {
          date: formatDateTime(new Date(bill.closedAt), locale),
        })
      : billStatus.status === "canceled" && bill.canceledAt !== null
        ? t("billDetail.canceledAtValue", {
            date: formatDateTime(new Date(bill.canceledAt), locale),
          })
        : null

  return (
    <YStack gap="3">
      {billStatus.status === "open" ? (
        <Button
          size="lg"
          label={t("billDetail.backToBill")}
          onPress={() => router.push({ pathname: "/bill", params: { billId } })}
        />
      ) : null}

      <Card
        title={
          bill.label ?? t("bill.list.label", { number: bill.displayNumber })
        }
        subtitle={formatDateTime(new Date(bill.createdAt), locale)}
        badge={
          <StatusBadge
            label={t(billStatusLabelKey[billStatus.status])}
            tone={billStatusTone[billStatus.status]}
          />
        }
      >
        <YStack gap="1">
          <Text fontSize={32} fontWeight="700">
            {formatMoney(
              { value: totalAmount, currency: bill.currency },
              locale
            )}
          </Text>
          {closedOrCanceled === null ? null : (
            <Text color="muted-foreground">{closedOrCanceled}</Text>
          )}
        </YStack>

        {/* Spelled out rather than "—": a counter sale with no table is a fact; "—" is a table row that is gone. */}
        <DetailRow
          label={t("billDetail.table")}
          value={
            bill.tableId === null
              ? t("billDetail.noTable")
              : (table?.name ?? t("billDetail.emptyValue"))
          }
        />

        {billStatus.hasCancellationCollision ? (
          <CollisionAlert
            title={t("bill.collision.title")}
            description={t("bill.collision.description")}
          >
            <BillCancellationCollisionActions billId={billId} />
          </CollisionAlert>
        ) : null}

        <BillLines
          summaries={summaries}
          emptyMessage={t("billDetail.items.empty")}
        />
        {hasTaxableLines(taxRecapRows) ? (
          <TaxRecap rows={taxRecapRows} currency={bill.currency} />
        ) : null}
        {coverage === "paid" ? null : (
          <BillCoverageWarning
            coverage={coverage}
            expectedAmount={totalAmount}
            claimedSum={claimedSum}
            currency={bill.currency}
          />
        )}
      </Card>

      <Card title={t("billDetail.payments")}>
        {payments.length === 0 ? (
          <Text color="muted-foreground">{t("billDetail.payments.empty")}</Text>
        ) : (
          <YStack gap="1">
            {payments.map((payment) => (
              <BillPaymentRowView
                key={payment.id}
                payment={payment}
                refundSummary={refundsByPayment.get(payment.id)}
              />
            ))}
          </YStack>
        )}
      </Card>

      {/* EET sale badges on the payments come with the EET task. */}

      <Technical>
        <OptionalRow mono label={t("billDetail.id")} value={bill.id} />
        <OptionalRow
          mono
          label={t("paymentDetail.deviceId")}
          value={bill.deviceId}
        />
        {bill.updatedAt === null ? null : (
          <DetailRow
            label={t("paymentDetail.updatedAt")}
            value={formatDateTime(new Date(bill.updatedAt), locale)}
          />
        )}
      </Technical>
    </YStack>
  )
}

function BillPaymentRowView({
  payment,
  refundSummary,
}: {
  readonly payment: BillPaymentRow
  readonly refundSummary: PaymentRefundSummary | undefined
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const hasActiveClaim = payment.claimedTransactions.length > 0
  const now = useNow([payment.expiresAt])
  const status = derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim,
    now,
  })
  const hasCancellationCollision = derivePaymentHasCancellationCollision({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    hasActiveClaim,
  })
  const refundLabel = refundBadgeLabel(refundSummary, t, locale)
  const methods = paymentMethodsText(
    payment.claimedTransactions.map(({ kind }) => kind),
    t
  )
  const amount = formatMoney(
    { value: payment.amount, currency: payment.currency },
    locale
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${amount}, ${t(paymentStatusLabelKey[status])}`}
      onPress={() =>
        router.push({
          pathname: "/activity/[paymentId]",
          params: { paymentId: payment.id },
        })
      }
    >
      <XStack gap="3" py="2" items="center">
        <StatusDot
          tone={
            hasCancellationCollision ? "warning" : paymentStatusTone[status]
          }
          glyph={hasCancellationCollision ? "⚠" : statusGlyph[status]}
        />
        <YStack flex={1}>
          <Text fontWeight="600">{amount}</Text>
          <Text fontSize={12} color="muted-foreground">
            {[formatDateTime(new Date(payment.createdAt), locale), methods]
              .filter((part): part is string => part !== null)
              .join(" · ")}
          </Text>
        </YStack>
        <YStack items="flex-end" gap="1">
          <StatusBadge
            label={t(paymentStatusLabelKey[status])}
            tone={paymentStatusTone[status]}
          />
          {refundLabel === null ? null : (
            <Text fontSize={12} color="warning">
              {refundLabel}
            </Text>
          )}
        </YStack>
      </XStack>
    </Pressable>
  )
}

const statusGlyph = {
  paid: "✓",
  pending: "…",
  expired: "–",
  canceled: "✕",
} as const
