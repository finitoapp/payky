import {
  evoluJsonArrayFrom,
  type InferRow,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import type { FC, ReactNode } from "react"
import { useCallback } from "react"
import { ActivityHistorySkeleton } from "@/components/activity-history-skeleton.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  calculateClaimedSum,
  deriveBillCoverage,
} from "@/core/modules/bill/bill-utils.ts"
import { calculateBillLineSummaries } from "@/core/modules/bill-line/bill-line-utils.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import {
  calculatePaymentClaimedSum,
  derivePaymentHasExcessSettlement,
  derivePaymentStatus,
  type PaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
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

/**
 * The most recent payments, newest first — the read model behind the
 * `/activity` list. Mirrors `latestBillsQuery` in `bill-queries.ts`: embeds
 * everything `PaymentHistoryIssues` used to load per row via separate
 * `billId`/`paymentId`-scoped queries (`useBillCoverage`,
 * `activeClaimedTransactionsByPaymentIdQuery`, `claimedPaymentsByBillIdQuery`)
 * as `evoluJsonArrayFrom` subqueries, so the whole list loads in one round
 * trip instead of a per-row Suspense waterfall:
 *
 * - `ownClaimedTransactions` — this payment's own claimed transactions
 *   (mirrors `activeClaimedTransactionsByPaymentIdQuery`), for
 *   `derivePaymentHasExcessSettlement`.
 * - `billLines` — the bill's line ledger (mirrors `billLinesByBillIdQuery`),
 *   reduced via `calculateBillLineSummaries` for the bill's total.
 * - `billClaimedTransactions` — every claimed transaction across every
 *   payment on the same bill (mirrors `claimedTransactionsByBillIdQuery`),
 *   for the bill's `coverage` and for `hasOtherClaimedPayment` (any row here
 *   whose `paymentId` isn't this payment's). Reusing this instead of also
 *   embedding `claimedPaymentsByBillIdQuery`'s looser "has any claim at all"
 *   definition is a deliberate simplification: the two definitions only
 *   differ when a claim's `accountTransaction` was itself deleted after the
 *   fact, which no domain action in this app currently does.
 *
 * A `billId`-less payment naturally gets empty `billLines`/
 * `billClaimedTransactions` (the `whereRef` never matches `NULL`), the same
 * "nothing to flag" result the old `NO_BILL_ID` sentinel produced.
 *
 * Parametrized by `limit` for the infinite-scroll list: pass
 * `limit: pageSize + 1` and slice off the extra row to detect whether more
 * payments remain without a separate count query.
 */
const latestPaymentsQuery = ({ limit }: { readonly limit: number }) =>
  createQuery((db) =>
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
      .select((eb) => [
        eb.fn.count<number>("reconciliationClaim.id").as("claimCount"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("reconciliationClaim as ownClaim")
            .innerJoin(
              "accountTransaction as ownClaimTx",
              "ownClaimTx.id",
              "ownClaim.accountTransactionId"
            )
            .select(["ownClaim.accountTransactionId", "ownClaimTx.amount"])
            .whereRef("ownClaim.paymentId", "=", "payment.id")
            .where("ownClaim.isDeleted", "is not", sqliteTrue)
            .where("ownClaim.accountTransactionId", "is not", null)
            .where("ownClaimTx.isDeleted", "is not", sqliteTrue)
            .where("ownClaimTx.amount", "is not", null)
            .$narrowType<{
              accountTransactionId: KyselyNotNull
              amount: KyselyNotNull
            }>()
        ).as("ownClaimedTransactions"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("billLine")
            .select([
              "billLine.id",
              "billLine.billId",
              "billLine.deviceId",
              "billLine.catalogItemId",
              "billLine.itemId",
              "billLine.type",
              "billLine.kind",
              "billLine.quantity",
              "billLine.totalAmount",
              "billLine.createdAt",
              "billLine.updatedAt",
              "billLine.isDeleted",
              "billLine.ownerId",
            ])
            .whereRef("billLine.billId", "=", "payment.billId")
            .where("billLine.billId", "is not", null)
            .where("billLine.itemId", "is not", null)
            .where("billLine.type", "is not", null)
            .where("billLine.kind", "is not", null)
            .where("billLine.quantity", "is not", null)
            .where("billLine.totalAmount", "is not", null)
            .orderBy("billLine.createdAt", "asc")
            .$narrowType<{
              billId: KyselyNotNull
              itemId: KyselyNotNull
              type: KyselyNotNull
              kind: KyselyNotNull
              quantity: KyselyNotNull
              totalAmount: KyselyNotNull
            }>()
        ).as("billLines"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("payment as billPayment")
            .innerJoin("reconciliationClaim as billClaim", (join) =>
              join
                .onRef("billClaim.paymentId", "=", "billPayment.id")
                .on("billClaim.isDeleted", "is not", sqliteTrue)
            )
            .innerJoin(
              "accountTransaction as billClaimTx",
              "billClaimTx.id",
              "billClaim.accountTransactionId"
            )
            .select([
              "billPayment.id as paymentId",
              "billPayment.tipAmount",
              "billClaim.accountTransactionId",
              "billClaimTx.amount",
            ])
            .whereRef("billPayment.billId", "=", "payment.billId")
            .where("billPayment.isDeleted", "is not", sqliteTrue)
            .where("billPayment.tipAmount", "is not", null)
            .where("billClaim.accountTransactionId", "is not", null)
            .where("billClaimTx.isDeleted", "is not", sqliteTrue)
            .where("billClaimTx.amount", "is not", null)
            .$narrowType<{
              tipAmount: KyselyNotNull
              accountTransactionId: KyselyNotNull
              amount: KyselyNotNull
            }>()
        ).as("billClaimedTransactions"),
      ])
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
      .limit(limit)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

type PaymentHistoryRow = InferRow<ReturnType<typeof latestPaymentsQuery>>

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
  readonly canceledAt: PaymentHistoryRow["canceledAt"]
  readonly confirmedPaidAt: PaymentHistoryRow["confirmedPaidAt"]
  readonly expiresAt: PaymentHistoryRow["expiresAt"]
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
  itemRows: ReadonlyArray<ItemRow>,
  hasCancellationCollision: boolean
): PaymentHistoryIssueFlags => {
  const billSummaries = calculateBillLineSummaries(item.billLines, itemRows)
  const billTotal = NonNegativeInteger(
    billSummaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )
  const billClaimedSum = calculateClaimedSum(item.billClaimedTransactions)
  const coverage = deriveBillCoverage(billTotal, billClaimedSum)

  const hasExcessSettlement = derivePaymentHasExcessSettlement({
    amount: item.amount,
    excessAcknowledgedAt: item.excessAcknowledgedAt,
    claimedSum: calculatePaymentClaimedSum(item.ownClaimedTransactions),
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
  const createPageQuery = useCallback(
    (limit: number) => latestPaymentsQuery({ limit }),
    []
  )
  const {
    rows: items,
    hasMore,
    isPending,
    sentinelRef,
  } = useInfiniteEvoluQuery([], createPageQuery)
  const { data: itemRows } = useEvoluQuery(itemsQuery)

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
            const issueFlags = resolvePaymentHistoryIssueFlags(
              item,
              itemRows,
              hasCancellationCollision
            )

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
                    <PaymentHistoryIssues flags={issueFlags} />
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
      {hasMore && (
        <>
          {isPending && <ActivityHistorySkeleton rows={5} />}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </>
      )}
    </div>
  )
}
