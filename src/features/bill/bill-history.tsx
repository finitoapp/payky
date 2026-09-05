import type { InferRow } from "@evolu/common"
import {
  AlertTriangleIcon,
  CheckIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useCallback, useMemo } from "react"
import { ActivityHistorySkeleton } from "@/components/activity-history-skeleton.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { latestBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import {
  type BillHistoryItemSummary,
  deriveBillHistoryItemSummary,
} from "@/core/modules/bill/bill-utils.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDate, formatMoney, formatTime } from "@/lib/format-utils.ts"
import { groupByDay } from "@/lib/group-by-day.ts"
import { cn } from "@/lib/utils.ts"

type BillHistoryRow = InferRow<ReturnType<typeof latestBillsQuery>>

const billStatusIconData = {
  open: ["bg-warning/10 text-warning", <RotateCwIcon key="open" />],
  closed: ["bg-success/10 text-success", <CheckIcon key="closed" />],
  canceled: ["bg-destructive/10 text-destructive", <XIcon key="canceled" />],
} satisfies Record<
  BillHistoryItemSummary["status"],
  readonly [string, ReactNode]
>

function BillStatusIcon({
  status,
  hasCancellationCollision,
}: {
  readonly status: BillHistoryItemSummary["status"]
  readonly hasCancellationCollision: boolean
}) {
  const [className, icon] = hasCancellationCollision
    ? ["bg-warning/10 text-warning", <AlertTriangleIcon key="collision" />]
    : billStatusIconData[status]

  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-full",
        className
      )}
    >
      {icon}
    </div>
  )
}

/**
 * Everything this bill row should flag, joined with " · " — the
 * canceled+funded collision (see docs/bill-payment-states.md), and coverage
 * being off. Overpaid is always worth flagging; underpaid is only flagged
 * once a partial payment has actually landed (`claimedSum > 0`) — an
 * ordinary open cart with nothing paid yet is also "underpaid" by
 * definition, and flagging every one of those would drown out the genuine
 * signal (see the "reading the combination" table in
 * docs/bill-payment-states.md).
 */
function BillHistoryIssues({
  summary,
}: {
  readonly summary: BillHistoryItemSummary
}) {
  const { t } = useTranslation()

  const issues = [
    summary.hasCancellationCollision ? t("bill.collision.title") : null,
    summary.coverage === "overpaid" ? t("billHistory.overpaid") : null,
    summary.coverage === "underpaid" && summary.claimedSum > 0
      ? t("billHistory.underpaid")
      : null,
  ].filter((issue): issue is string => issue !== null)

  if (issues.length === 0) return null

  return (
    <span className="text-xs font-medium text-warning">
      {issues.join(" · ")}
    </span>
  )
}

/**
 * Reproduces the icon/label/action layout `NavItemContent` (`vertical-nav.tsx`)
 * and `PaymentHistory` build from separate `item` slots — bill rows can't use
 * those slots directly since every piece (icon, amount, status text) needs
 * `bill.lines`/`bill.claimedTransactions`, already loaded by `latestBillsQuery`
 * for every row in one round trip, reduced here through the same pure
 * `calculateBillLineSummaries`/`deriveBillHistoryItemSummary` the detail page
 * uses — not a plain `.map()` callback. Assembling the equivalent DOM by hand
 * here, instead, is what keeps a bill row visually identical to a payment row.
 */
function BillHistoryItemContent({
  bill,
  itemRows,
}: {
  readonly bill: BillHistoryRow
  readonly itemRows: ReadonlyArray<ItemRow>
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  const summary = useMemo(() => {
    const summaries = calculateBillLineSummaries(bill.lines, itemRows)
    const billTotal = NonNegativeInteger(
      summaries.reduce((sum, item) => sum + item.totalAmount, 0)
    )

    return deriveBillHistoryItemSummary({
      canceledAt: bill.canceledAt,
      confirmedClosedAt: bill.confirmedClosedAt,
      billTotal,
      claimedTransactions: bill.claimedTransactions,
    })
  }, [bill, itemRows])

  return (
    <div className={"flex items-center gap-3 w-full"}>
      <div className={"p-2"}>
        <BillStatusIcon
          status={summary.status}
          hasCancellationCollision={summary.hasCancellationCollision}
        />
      </div>
      <div className={"flex gap-2 justify-between w-full"}>
        <div className={"flex flex-col gap-2 items-start w-max"}>
          <strong>
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </strong>
          <div className={"flex text-xs"}>
            <span>
              {formatMoney(
                { value: summary.billTotal, currency: bill.currency },
                locale
              )}
            </span>
            &nbsp;&nbsp;•&nbsp;&nbsp;
            <span className={"text-muted-foreground"}>
              {formatTime(new Date(bill.createdAt), locale)}
            </span>
          </div>
          <BillHistoryIssues summary={summary} />
        </div>
      </div>
      <div className={"pl-2"}>
        <span className="text-xs font-medium text-muted-foreground">
          {t(`billHistory.status.${summary.status}`)}
        </span>
      </div>
    </div>
  )
}

export const BillHistory = () => {
  const { t } = useTranslation()
  const locale = useLocale()
  const createPageQuery = useCallback(
    (limit: number) => latestBillsQuery({ limit }),
    []
  )
  const {
    rows: items,
    hasMore,
    isPending,
    sentinelRef,
  } = useInfiniteEvoluQuery("", createPageQuery)
  const { data: itemRows } = useEvoluQuery(itemsQuery)

  const empty = (
    <div className={"flex flex-col justify-center items-center gap-8 py-10"}>
      <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
      <h2 className={"text-foreground text-lg"}>
        {t("billHistory.empty.title")}
      </h2>
      <p className="text-balance text-sm text-muted-foreground text-center">
        {t("billHistory.empty.description")}
      </p>
    </div>
  )

  if (items.length === 0) {
    return (
      <VerticalNav title={t("billHistory.title")} empty={empty} items={[]} />
    )
  }

  const dayGroups = groupByDay(items, (bill) => new Date(bill.createdAt))

  return (
    <div className="flex flex-col gap-4">
      {dayGroups.map((group) => (
        <VerticalNav
          key={group.date.toDateString()}
          title={formatDate(group.date, locale)}
          items={group.items.map((bill) => ({
            id: bill.id,
            kind: "link" as const,
            to: "/activity/bills/$billId",
            params: { billId: bill.id },
            disableAction: true,
            label: <BillHistoryItemContent bill={bill} itemRows={itemRows} />,
          }))}
        />
      ))}
      {hasMore && (
        <>
          {isPending && <ActivityHistorySkeleton rows={5} />}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </>
      )}
    </div>
  )
}
