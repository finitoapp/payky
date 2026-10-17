import {
  derivePaymentHistoryRowState,
  formatActivityDayTitle,
  hasAnyIssue,
  type PaymentHistoryRow,
  paymentHistoryIssueLabels,
  refundBadgeLabel,
  resolvePaymentTitle,
} from "@payky/app-shared/activity-history"
import { paymentStatusLabelKey } from "@payky/app-shared/activity-labels"
import { formatTime } from "@payky/app-shared/format-date"
import { formatMoney } from "@payky/app-shared/format-money"
import { groupByDay } from "@payky/app-shared/group-by-day"
import { useNow } from "@payky/app-shared/use-now"
import { latestPaymentsQuery } from "@payky/core/modules/payment/payment-queries"
import type { PaymentStatus } from "@payky/core/modules/payment/payment-types"
import { refundSummariesQuery } from "@payky/core/modules/refund/refund-queries"
import { summarizeRefundsByPayment } from "@payky/core/modules/refund/refund-utils"
import { router } from "expo-router"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useInfiniteEvoluQuery } from "../../hooks/use-infinite-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  type ActivityGroup,
  ActivityList,
  paymentMethodsText,
  type StatusTone,
} from "./activity-parts.tsx"
import { ActivityShell } from "./activity-shell.tsx"

const statusPresentation = {
  paid: { tone: "success", glyph: "✓" },
  pending: { tone: "warning", glyph: "…" },
  expired: { tone: "muted", glyph: "–" },
  canceled: { tone: "danger", glyph: "✕" },
} as const satisfies Record<
  PaymentStatus,
  { readonly tone: StatusTone; readonly glyph: string }
>

/** The Activity tab's payments list. */
export function PaymentHistoryPage() {
  return (
    <ActivityShell active="payments">
      <PaymentHistory />
    </ActivityShell>
  )
}

function PaymentHistory() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { rows, hasMore, isPending, loadMore } = useInfiniteEvoluQuery(
    [],
    latestPaymentsQuery
  )
  const refunds = useEvoluQuery(refundSummariesQuery).data
  const refundsByPayment = summarizeRefundsByPayment(refunds)
  // Nothing writes a row when a payment expires, so the clock has to tick on
  // its own or a listed pending payment never becomes Expired.
  const now = useNow(rows.map((row) => row.expiresAt))

  const toRow = (item: PaymentHistoryRow) => {
    const state = derivePaymentHistoryRowState(item, now)
    const presentation = statusPresentation[state.status]
    const details = [
      formatTime(new Date(item.createdAt), locale),
      item.tableName,
      item.tipAmount > 0
        ? t("paymentHistory.tip", {
            amount: formatMoney(
              { value: item.tipAmount, currency: item.currency },
              locale
            ),
          })
        : null,
      paymentMethodsText(
        item.ownClaimedTransactions.map(
          (transaction) => transaction.transactionKind
        ),
        t
      ),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ")

    return {
      id: item.id,
      title: resolvePaymentTitle(item, t),
      details,
      issues: hasAnyIssue(state.issueFlags)
        ? paymentHistoryIssueLabels(state.issueFlags, t)
        : [],
      refundLabel:
        refundBadgeLabel(refundsByPayment.get(item.id), t, locale) ?? undefined,
      amount: formatMoney(
        { value: item.amount, currency: item.currency },
        locale
      ),
      isVoid: state.isVoid,
      statusLabel: t(paymentStatusLabelKey[state.status]),
      // A canceled payment whose money arrived anyway is a warning, not a cross.
      statusTone: state.hasCancellationCollision
        ? ("warning" as const)
        : presentation.tone,
      statusGlyph: state.hasCancellationCollision ? "⚠" : presentation.glyph,
      onPress: () =>
        router.push({
          pathname: "/activity/[paymentId]",
          params: { paymentId: item.id },
        }),
    }
  }

  const dayGroups = groupByDay(rows, (item) => new Date(item.createdAt))
  const groups: ReadonlyArray<ActivityGroup> = dayGroups.map(
    (group, groupIndex) => ({
      key: group.date.toDateString(),
      // Only paid payments count: a pending, expired or canceled one is money
      // that never arrived. The last group may continue on the next page.
      title: formatActivityDayTitle({
        date: group.date,
        now,
        locale,
        amounts: group.items
          .filter(
            (item) => derivePaymentHistoryRowState(item, now).status === "paid"
          )
          .map((item) => ({ value: item.amount, currency: item.currency })),
        isComplete: !hasMore || groupIndex < dayGroups.length - 1,
      }),
      rows: group.items.map(toRow),
    })
  )

  return (
    <ActivityList
      groups={groups}
      emptyTitle={t("paymentHistory.empty.title")}
      emptyDescription={t("paymentHistory.empty.description")}
      hasMore={hasMore}
      isPending={isPending}
      loadMore={loadMore}
    />
  )
}
