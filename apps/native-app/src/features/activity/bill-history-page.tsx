import {
  type BillHistoryRow,
  billHistoryIssueLabels,
  formatActivityDayTitle,
  summarizeBillHistoryRow,
  sumSettledTips,
} from "@payky/app-shared/activity-history"
import { billStatusLabelKey } from "@payky/app-shared/activity-labels"
import { formatTime } from "@payky/app-shared/format-date"
import { formatMoney } from "@payky/app-shared/format-money"
import { groupByDay } from "@payky/app-shared/group-by-day"
import { useNow } from "@payky/app-shared/use-now"
import { latestBillsQuery } from "@payky/core/modules/bill/bill-queries"
import type { BillStatus } from "@payky/core/modules/bill/bill-types"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
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
  closed: { tone: "success", glyph: "✓" },
  open: { tone: "warning", glyph: "…" },
  canceled: { tone: "danger", glyph: "✕" },
} as const satisfies Record<
  BillStatus,
  { readonly tone: StatusTone; readonly glyph: string }
>

/** The Activity tab's bills list. */
export function BillHistoryPage() {
  return (
    <ActivityShell active="bills">
      <BillHistory />
    </ActivityShell>
  )
}

function BillHistory() {
  const { t } = useTranslation()
  const locale = useLocale()
  const now = useNow([])
  const { rows, hasMore, isPending, loadMore } = useInfiniteEvoluQuery(
    [],
    latestBillsQuery
  )

  const summarized = rows.map((bill) => ({
    bill,
    summary: summarizeBillHistoryRow(bill),
  }))

  const toRow = ({
    bill,
    summary,
  }: {
    readonly bill: BillHistoryRow
    readonly summary: ReturnType<typeof summarizeBillHistoryRow>
  }) => {
    const presentation = statusPresentation[summary.status]
    const tips = sumSettledTips(bill)
    const details = [
      formatTime(new Date(bill.createdAt), locale),
      bill.tableName,
      tips > 0
        ? t("billHistory.tip", {
            amount: formatMoney(
              { value: NonNegativeInteger(tips), currency: bill.currency },
              locale
            ),
          })
        : null,
      paymentMethodsText(
        bill.claimedTransactions.map(
          (transaction) => transaction.transactionKind
        ),
        t
      ),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ")

    return {
      id: bill.id,
      title: bill.label ?? t("bill.list.label", { number: bill.displayNumber }),
      details,
      issues: billHistoryIssueLabels(summary, t),
      amount: formatMoney(
        { value: summary.billTotal, currency: bill.currency },
        locale
      ),
      // A canceled bill whose money arrived anyway is not void — striking its
      // total through would hide exactly that.
      isVoid:
        summary.status === "canceled" && !summary.hasCancellationCollision,
      statusLabel: t(billStatusLabelKey[summary.status]),
      statusTone: summary.hasCancellationCollision
        ? ("warning" as const)
        : presentation.tone,
      statusGlyph: summary.hasCancellationCollision ? "⚠" : presentation.glyph,
      onPress: () =>
        router.push({
          pathname: "/activity/bills/[billId]",
          params: { billId: bill.id },
        }),
    }
  }

  const dayGroups = groupByDay(
    summarized,
    ({ bill }) => new Date(bill.createdAt)
  )
  const groups: ReadonlyArray<ActivityGroup> = dayGroups.map(
    (group, groupIndex) => ({
      key: group.date.toDateString(),
      title: formatActivityDayTitle({
        date: group.date,
        now,
        locale,
        // Only closed bills count: an open one isn't settled yet and a
        // canceled one never will be.
        amounts: group.items
          .filter(({ summary }) => summary.status === "closed")
          .map(({ bill, summary }) => ({
            value: summary.billTotal,
            currency: bill.currency,
          })),
        // The last group may continue on the next, not yet loaded page.
        isComplete: !hasMore || groupIndex < dayGroups.length - 1,
      }),
      rows: group.items.map(toRow),
    })
  )

  return (
    <ActivityList
      groups={groups}
      emptyTitle={t("billHistory.empty.title")}
      emptyDescription={t("billHistory.empty.description")}
      hasMore={hasMore}
      isPending={isPending}
      loadMore={loadMore}
    />
  )
}
