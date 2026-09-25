import type { InferRow } from "@evolu/common"
import { ReceiptIcon } from "lucide-react"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import {
  calculateClaimedSum,
  deriveBillCoverage,
} from "@/core/modules/bill/bill-utils.ts"
import {
  calculateBillLineSummaries,
  deriveBillSummaryTotal,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import { latestPaymentsQuery } from "@/core/modules/payment/payment-queries.ts"
import {
  derivePaymentHasExcessSettlement,
  derivePaymentStatus,
  type PaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import { sumDistinctClaimedAmounts } from "@/core/modules/shared/claimed-amount.ts"
import { ActivityHistorySkeleton } from "@/features/activity/activity-history-skeleton.tsx"
import {
  ActivityAmount,
  ActivityIssueBadges,
  activityIssueRowClassName,
  formatActivityDayTitle,
  PaymentMethodIcons,
} from "@/features/activity/activity-row.tsx"
import {
  PaymentStatusIcon,
  paymentStatusLabelKey,
} from "@/features/payment/payment-status-display.tsx"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney, formatTime } from "@/lib/format-utils.ts"
import { groupByDay } from "@/lib/group-by-day.ts"

type PaymentHistoryRow = InferRow<ReturnType<typeof latestPaymentsQuery>>

const resolvePaymentStatus = (
  payment: {
    readonly canceledAt: PaymentHistoryRow["canceledAt"]
    readonly confirmedPaidAt: PaymentHistoryRow["confirmedPaidAt"]
    readonly expiresAt: PaymentHistoryRow["expiresAt"]
    readonly claimCount: number
  },
  now: Date
): PaymentStatus =>
  derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: payment.claimCount > 0,
    now,
  })

/**
 * Claims whose `accountTransaction` is still there, which is what
 * `hasActiveClaim` and the cancellation collision both mean by "claimed" —
 * a claim pointing at a deleted transaction is not money that arrived, and
 * the bill's coverage already ignores it. `ownClaimedTransactions` is
 * already embedded for `derivePaymentHasExcessSettlement`, so this needs no
 * extra query — which let the outer `reconciliationClaim` join, its `COUNT`
 * and the `groupBy` that count forced all come out of the query, along with
 * the `bigint`/`string` coercion that `COUNT` needed at the boundary.
 */
const toSettledClaimCount = (payment: PaymentHistoryRow): number =>
  payment.ownClaimedTransactions.length

/**
 * The canceled+claimed collision described in docs/bill-payment-states.md:
 * `derivePaymentStatus` still shows the payment as Canceled until staff
 * resolves it via `confirmPaymentPaidDespiteCancellation` on the detail
 * page, but the list should surface it too so it isn't only discoverable by
 * opening every canceled payment.
 */
const resolveHasCancellationCollision = (payment: {
  readonly canceledAt: PaymentHistoryRow["canceledAt"]
  readonly confirmedPaidAt: PaymentHistoryRow["confirmedPaidAt"]
  readonly claimCount: number
}): boolean =>
  payment.canceledAt !== null &&
  payment.confirmedPaidAt === null &&
  payment.claimCount > 0

interface PaymentHistoryIssueFlags {
  readonly hasCancellationCollision: boolean
  readonly hasExcessSettlement: boolean
  readonly billUnderpaid: boolean
  readonly billOverpaid: boolean
}

/**
 * Every issue a payment's row should flag — the canceled+claimed collision,
 * this payment's own duplicate-settlement collision, and/or its bill's
 * coverage being off (see docs/bill-payment-states.md's "Bill payment
 * coverage" section). `billUnderpaid` is only flagged once a partial payment
 * has actually landed on the bill (`billClaimedSum > 0`), exactly as
 * `BillHistoryIssues` does it — an ordinary open bill with nothing paid yet
 * is also "underpaid" by definition, so flagging it would put the warning on
 * every pending bill payment row. `billOverpaid` needs no such gate: an
 * unpaid bill is never overpaid.
 *
 * `billOverpaid` is deliberately suppressed when it's fully explained by this
 * same payment's own excess settlement (this is the only claimed payment on
 * the bill) — "Paid more than once" already says that, and flagging both
 * would restate the identical fact from the bill's point of view instead of a
 * second, independent one. It still shows when *another* payment is also
 * claimed against the bill, since that's a genuinely different cause.
 */
const resolvePaymentHistoryIssueFlags = (
  item: PaymentHistoryRow,
  hasCancellationCollision: boolean
): PaymentHistoryIssueFlags => {
  const billSummaries = calculateBillLineSummaries(
    item.billLines,
    item.billItems
  )
  const billTotal = deriveBillSummaryTotal(billSummaries)
  const billClaimedSum = calculateClaimedSum(item.billClaimedTransactions)
  const coverage = deriveBillCoverage(billTotal, billClaimedSum)

  const hasExcessSettlement = derivePaymentHasExcessSettlement({
    amount: item.amount,
    excessAcknowledgedAt: item.excessAcknowledgedAt,
    claimedSum: sumDistinctClaimedAmounts(item.ownClaimedTransactions),
  })
  const hasOtherClaimedPayment = item.billClaimedTransactions.some(
    (transaction) => transaction.paymentId !== item.id
  )

  return {
    hasCancellationCollision,
    hasExcessSettlement,
    billUnderpaid:
      item.billId !== null && coverage === "underpaid" && billClaimedSum > 0,
    billOverpaid:
      item.billId !== null &&
      coverage === "overpaid" &&
      (!hasExcessSettlement || hasOtherClaimedPayment),
  }
}

function PaymentHistoryIssues({
  flags,
}: {
  readonly flags: PaymentHistoryIssueFlags
}) {
  const { t } = useTranslation()

  const issues = [
    // Both reuse the same title `payment-detail.tsx` shows for the
    // identical collision, rather than a separate, list-only wording — one
    // specific label per distinct error, instead of a single generic
    // "Needs review" that didn't say which of them applied.
    flags.hasCancellationCollision ? t("paymentDetail.collision.title") : null,
    flags.hasExcessSettlement ? t("paymentDetail.excessCollision.title") : null,
    flags.billUnderpaid ? t("paymentHistory.billUnderpaid") : null,
    flags.billOverpaid ? t("paymentHistory.billOverpaid") : null,
  ].filter((issue): issue is string => issue !== null)

  return <ActivityIssueBadges issues={issues} />
}

const hasAnyIssue = (flags: PaymentHistoryIssueFlags): boolean =>
  Object.values(flags).some(Boolean)

/**
 * The row's title: the bill it paid (its label, else its number), else the
 * payment's own sequential number, so rows can be told apart without
 * opening each one.
 */
const resolvePaymentTitle = (
  item: PaymentHistoryRow,
  t: ReturnType<typeof useTranslation>["t"]
): string => {
  if (item.billLabel !== null) return item.billLabel
  if (item.billDisplayNumber !== null)
    return t("bill.list.label", { number: item.billDisplayNumber })
  if (item.paymentSerialNumber !== null)
    return t("paymentHistory.paymentNumber", {
      number: item.paymentSerialNumber,
    })
  return t("paymentHistory.payment")
}

export const PaymentHistory = () => {
  const { t } = useTranslation()
  const locale = useLocale()
  const {
    rows: items,
    hasMore,
    isPending,
    sentinelRef,
  } = useInfiniteEvoluQuery([], latestPaymentsQuery)
  // Nothing writes a row when a payment expires, so the clock has to tick on
  // its own or a listed pending payment never becomes Expired.
  const now = useNow(items.map((item) => item.expiresAt))

  const empty = (
    <div className={"flex flex-col justify-center items-center gap-8 py-10"}>
      <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
      <h2 className={"text-foreground text-lg"}>
        {t("paymentHistory.empty.title")}
      </h2>
      <p className="text-balance text-sm text-muted-foreground text-center">
        {t("paymentHistory.empty.description")}
      </p>
    </div>
  )

  if (items.length === 0) {
    return (
      <VerticalNav title={t("paymentHistory.title")} empty={empty} items={[]} />
    )
  }

  const dayGroups = groupByDay(items, (item) => new Date(item.createdAt))
  const statusOf = (item: PaymentHistoryRow) =>
    resolvePaymentStatus(
      {
        canceledAt: item.canceledAt,
        confirmedPaidAt: item.confirmedPaidAt,
        expiresAt: item.expiresAt,
        claimCount: toSettledClaimCount(item),
      },
      now
    )

  return (
    <div className="flex flex-col gap-4">
      {dayGroups.map((group, groupIndex) => {
        // The last group may continue on the next, not yet loaded page.
        const isComplete = !hasMore || groupIndex < dayGroups.length - 1
        // Only paid payments count: a pending, expired or canceled one is
        // money that never arrived.
        const title = formatActivityDayTitle({
          date: group.date,
          now,
          locale,
          amounts: group.items
            .filter((item) => statusOf(item) === "paid")
            .map((item) => ({ value: item.amount, currency: item.currency })),
          isComplete,
        })

        return (
          <VerticalNav
            key={group.date.toDateString()}
            title={title}
            items={group.items.map((item) => {
              const claimCount = toSettledClaimCount(item)
              const paymentStatus = statusOf(item)
              const hasCancellationCollision = resolveHasCancellationCollision({
                canceledAt: item.canceledAt,
                confirmedPaidAt: item.confirmedPaidAt,
                claimCount,
              })
              const issueFlags = resolvePaymentHistoryIssueFlags(
                item,
                hasCancellationCollision
              )
              // A canceled payment whose money arrived anyway is not void —
              // striking its amount through would hide exactly that.
              const isVoid =
                (paymentStatus === "canceled" || paymentStatus === "expired") &&
                !hasCancellationCollision

              return {
                id: item.id,
                kind: "link" as const,
                className: hasAnyIssue(issueFlags)
                  ? activityIssueRowClassName
                  : undefined,
                to: "/activity/$paymentId",
                params: {
                  paymentId: item.id,
                },
                label: (
                  <div className={"flex flex-col gap-1 items-start min-w-0"}>
                    <strong className="max-w-full truncate">
                      {resolvePaymentTitle(item, t)}
                    </strong>
                    <div
                      className={
                        "flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
                      }
                    >
                      <span>
                        {formatTime(new Date(item.createdAt), locale)}
                      </span>
                      {item.tableName !== null && (
                        <span>· {item.tableName}</span>
                      )}
                      {item.tipAmount > 0 && (
                        <span>
                          ·{" "}
                          {t("paymentHistory.tip", {
                            amount: formatMoney(
                              {
                                value: item.tipAmount,
                                currency: item.currency,
                              },
                              locale
                            ),
                          })}
                        </span>
                      )}
                      <PaymentMethodIcons
                        kinds={item.ownClaimedTransactions.map(
                          (transaction) => transaction.transactionKind
                        )}
                      />
                    </div>
                    <PaymentHistoryIssues flags={issueFlags} />
                  </div>
                ),
                icon: (
                  <div className={"p-2"}>
                    <PaymentStatusIcon
                      status={paymentStatus}
                      hasCancellationCollision={hasCancellationCollision}
                    />
                  </div>
                ),
                action: (
                  <ActivityAmount
                    money={{ value: item.amount, currency: item.currency }}
                    isVoid={isVoid}
                    statusLabel={t(paymentStatusLabelKey[paymentStatus])}
                  />
                ),
              }
            })}
          />
        )
      })}
      {hasMore && (
        <>
          {isPending && <ActivityHistorySkeleton rows={5} />}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </>
      )}
    </div>
  )
}
