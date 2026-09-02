import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import { type FC, type ReactNode, useMemo } from "react"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  calculatePaymentClaimedSum,
  derivePaymentHasExcessSettlement,
  derivePaymentStatus,
  type PaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { activeClaimedTransactionsByPaymentIdQuery } from "@/core/modules/reconciliation-claim/reconciliation-claim-queries.ts"
import type {
  NonNegativeInteger,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDate, formatMoney, formatTime } from "@/lib/format-utils.ts"
import { groupByDay } from "@/lib/group-by-day.ts"
import { cn } from "@/lib/utils.ts"

/**
 * `eb.fn.count<number>(...)` below only asserts the output type to
 * TypeScript — some SQLite drivers actually return COUNT() as a `bigint` or
 * `string` at runtime. Coerce once here, at the query boundary, instead of
 * letting the driver-dependent union leak into `PaymentHistoryStatusInput`.
 */
const toClaimCount = (value: number | string | bigint): number =>
  typeof value === "number" ? value : Number(value)

const latestPaymentsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .leftJoin("reconciliationClaim", (join) =>
      join
        .onRef("reconciliationClaim.paymentId", "=", "payment.id")
        .on("reconciliationClaim.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "payment.id",
      "payment.billId",
      "payment.amount",
      "payment.currency",
      "payment.tipAmount",
      "payment.canceledAt",
      "payment.confirmedPaidAt",
      "payment.excessAcknowledgedAt",
      "payment.expiresAt",
      "payment.createdAt",
    ])
    .select((eb) =>
      eb.fn.count<number>("reconciliationClaim.id").as("claimCount")
    )
    .where("payment.isDeleted", "is not", sqliteTrue)
    .where("payment.amount", "is not", null)
    .where("payment.currency", "is not", null)
    .where("payment.tipAmount", "is not", null)
    .where("payment.createdAt", "is not", null)
    .groupBy([
      "payment.id",
      "payment.billId",
      "payment.amount",
      "payment.currency",
      "payment.tipAmount",
      "payment.canceledAt",
      "payment.confirmedPaidAt",
      "payment.excessAcknowledgedAt",
      "payment.expiresAt",
      "payment.createdAt",
    ])
    .orderBy("payment.createdAt", "desc")
    .limit(50)
    .$narrowType<{
      amount: KyselyNotNull
      currency: KyselyNotNull
      tipAmount: KyselyNotNull
      createdAt: KyselyNotNull
    }>()
)

const paymentStatusData = {
  canceled: ["bg-destructive/10 text-destructive", <XIcon key="canceled" />],
  paid: ["bg-success/10 text-success", <CheckIcon key="paid" />],
  expired: ["bg-muted text-muted-foreground", <ClockIcon key="expired" />],
  pending: ["bg-warning/10 text-warning", <RotateCwIcon key="pending" />],
} satisfies Record<PaymentStatus, readonly [string, ReactNode]>

const PaymentStatusIcon: FC<{
  readonly paymentStatus: PaymentStatus
  readonly hasCancellationCollision: boolean
}> = (props) => {
  const [className, icon] = props.hasCancellationCollision
    ? ["bg-warning/10 text-warning", <AlertTriangleIcon key="collision" />]
    : paymentStatusData[props.paymentStatus]

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

const resolvePaymentStatus = (payment: {
  readonly canceledAt: TimestampMs | null
  readonly confirmedPaidAt: TimestampMs | null
  readonly expiresAt: TimestampMs | null
  readonly claimCount: number
}): PaymentStatus =>
  derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: payment.claimCount > 0,
    now: new Date(),
  })

/**
 * The canceled+claimed collision described in docs/bill-payment-states.md:
 * `derivePaymentStatus` still shows the payment as Canceled until staff
 * resolves it via `confirmPaymentPaidDespiteCancellation` on the detail
 * page, but the list should surface it too so it isn't only discoverable by
 * opening every canceled payment.
 */
const resolveHasCancellationCollision = (payment: {
  readonly canceledAt: TimestampMs | null
  readonly confirmedPaidAt: TimestampMs | null
  readonly claimCount: number
}): boolean =>
  payment.canceledAt !== null &&
  payment.confirmedPaidAt === null &&
  payment.claimCount > 0

/**
 * Never a real bill — passed to `useBillCoverage` instead of skipping the
 * call when a payment has no `billId`, so the hook is still called
 * unconditionally on every render (a payment's own `billId` is stable for
 * the lifetime of its row). Querying a nonexistent bill just returns empty
 * line/claim rows, which `deriveBillCoverage` reads as trivially "paid" —
 * exactly the "nothing to flag" result this needs when there's no bill.
 */
const NO_BILL_ID = "no-bill" as BillId

/**
 * Every issue this payment's row should flag, joined with " · " — the
 * canceled+claimed collision (see `resolveHasCancellationCollision`), this
 * payment's own duplicate-settlement collision, and/or its bill's coverage
 * being off (see docs/bill-payment-states.md's "Bill payment coverage"
 * section). A payment can show more than one at once; they're independent
 * conditions. `null` when none apply.
 *
 * Overpaid coverage is deliberately suppressed when it's fully explained by
 * this same payment's own excess settlement (this is the only claimed
 * payment on the bill) — "Paid more than once" already says that, and
 * showing "Bill overpaid" alongside it would restate the identical fact
 * from the bill's point of view instead of flagging a second, independent
 * one. It still shows when *another* payment is also claimed against the
 * bill, since that's a genuinely different cause.
 */
function PaymentHistoryIssues({
  hasCancellationCollision,
  billId,
  paymentId,
  amount,
  excessAcknowledgedAt,
}: {
  readonly hasCancellationCollision: boolean
  readonly billId: BillId | null
  readonly paymentId: PaymentId
  readonly amount: NonNegativeInteger
  readonly excessAcknowledgedAt: TimestampMs | null
}) {
  const { t } = useTranslation()
  const { coverage } = useBillCoverage(billId ?? NO_BILL_ID)
  const claimedTransactionsQuery = useMemo(
    () => activeClaimedTransactionsByPaymentIdQuery(paymentId),
    [paymentId]
  )
  const { data: claimedTransactions } = useEvoluQuery(claimedTransactionsQuery)
  const hasExcessSettlement = derivePaymentHasExcessSettlement({
    amount,
    excessAcknowledgedAt,
    claimedSum: calculatePaymentClaimedSum(claimedTransactions),
  })
  const claimedPaymentsQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId ?? NO_BILL_ID),
    [billId]
  )
  const { data: claimedPayments } = useEvoluQuery(claimedPaymentsQuery)
  const hasOtherClaimedPayment = [
    ...new Set(claimedPayments.map((payment) => payment.id)),
  ].some((id) => id !== paymentId)
  const showBillOverpaid =
    billId !== null &&
    coverage === "overpaid" &&
    (!hasExcessSettlement || hasOtherClaimedPayment)

  const issues = [
    // Both reuse the same title `payment-detail.tsx` shows for the
    // identical collision, rather than a separate, list-only wording — one
    // specific label per distinct error, instead of a single generic
    // "Needs review" that didn't say which of them applied.
    hasCancellationCollision ? t("paymentDetail.collision.title") : null,
    hasExcessSettlement ? t("paymentDetail.excessCollision.title") : null,
    billId !== null && coverage === "underpaid"
      ? t("paymentHistory.billUnderpaid")
      : null,
    showBillOverpaid ? t("paymentHistory.billOverpaid") : null,
  ].filter((issue): issue is string => issue !== null)

  if (issues.length === 0) return null

  return (
    <span className="text-xs font-medium text-warning">
      {issues.join(" · ")}
    </span>
  )
}

export const PaymentHistory = () => {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: items } = useEvoluQuery(latestPaymentsQuery)

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

  return (
    <div className="flex flex-col gap-4">
      {dayGroups.map((group) => (
        <VerticalNav
          key={group.date.toDateString()}
          title={formatDate(group.date, locale)}
          items={group.items.map((item) => {
            const claimCount = toClaimCount(item.claimCount)
            const paymentStatus = resolvePaymentStatus({
              canceledAt: item.canceledAt,
              confirmedPaidAt: item.confirmedPaidAt,
              expiresAt: item.expiresAt,
              claimCount,
            })
            const hasCancellationCollision = resolveHasCancellationCollision({
              canceledAt: item.canceledAt,
              confirmedPaidAt: item.confirmedPaidAt,
              claimCount,
            })

            return {
              id: item.id,
              kind: "link" as const,
              to: "/activity/$paymentId",
              params: {
                paymentId: item.id,
              },
              label: (
                <div className={"flex gap-2 justify-between"}>
                  <div className={"flex flex-col gap-2 items-start w-max"}>
                    <strong>{t("paymentHistory.payment")}</strong>
                    <div className={"flex text-xs"}>
                      <span>
                        {formatMoney(
                          {
                            value: item.amount,
                            currency: item.currency,
                          },
                          locale
                        )}
                      </span>
                      &nbsp;&nbsp;•&nbsp;&nbsp;
                      <span className={"text-muted-foreground"}>
                        {formatTime(new Date(item.createdAt), locale)}
                      </span>
                    </div>
                    <PaymentHistoryIssues
                      hasCancellationCollision={hasCancellationCollision}
                      billId={item.billId}
                      paymentId={item.id}
                      amount={item.amount}
                      excessAcknowledgedAt={item.excessAcknowledgedAt}
                    />
                  </div>
                </div>
              ),
              icon: (
                <div className={"p-2"}>
                  <PaymentStatusIcon
                    paymentStatus={paymentStatus}
                    hasCancellationCollision={hasCancellationCollision}
                  />
                </div>
              ),
              action: (
                <span className="text-xs font-medium text-muted-foreground">
                  {t(`paymentHistory.status.${paymentStatus}`)}
                </span>
              ),
            }
          })}
        />
      ))}
    </div>
  )
}
