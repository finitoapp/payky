import { Link } from "@tanstack/react-router"
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { CollisionAlert } from "@/components/collision-alert.tsx"
import { NotFoundCard } from "@/components/not-found-card.tsx"
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import {
  calculateTaxRecap,
  hasTaxableLines,
} from "@/core/modules/bill-line/bill-line-tax-utils.ts"
import { deriveBillSummaryTotal } from "@/core/modules/bill-line/bill-line-utils.ts"
import {
  acknowledgePaymentExcessSettlement,
  confirmPaymentPaidDespiteCancellation,
} from "@/core/modules/payment/payment-actions.ts"
import {
  paymentDetailQuery,
  paymentReconciliationsQuery,
} from "@/core/modules/payment/payment-queries.ts"
import {
  derivePaymentHasExcessSettlement,
  derivePaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { paymentNumberByPaymentIdQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import { sumDistinctClaimedAmounts } from "@/core/modules/shared/claimed-amount.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { BillCancellationCollisionPanel } from "@/features/bill/bill-cancellation-collision-panel.tsx"
import {
  type BillCoverageMismatchReason,
  BillCoverageWarning,
} from "@/features/bill/bill-coverage-warning.tsx"
import {
  billStatusBadgeClassName,
  billStatusLabelKey,
} from "@/features/bill/bill-status-display.ts"
import { TaxRecap } from "@/features/bill/tax-recap.tsx"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillLineSummaryDiff } from "@/features/bill/use-bill-line-summary-diff.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import {
  paymentMethodIcon,
  paymentMethodLabelKey,
} from "@/features/payment/payment-method-display.tsx"
import {
  paymentStatusBadgeClassName,
  paymentStatusLabelKey,
} from "@/features/payment/payment-status-display.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"
import { formatDateTime, formatMoney, formatTime } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentDetailClaimSource = "auto" | "manual"

const claimSourceLabelKey = {
  auto: "paymentDetail.reconciliation.source.auto",
  manual: "paymentDetail.reconciliation.source.manual",
} satisfies Record<PaymentDetailClaimSource, TranslationKey>

export function PaymentDetail({ paymentId }: { readonly paymentId: string }) {
  const parsedPaymentId = PaymentId.safeParse(paymentId)

  if (!parsedPaymentId.success) {
    return <NotFoundCard messageKey="paymentDetail.invalidId" />
  }

  return <PaymentDetailContent paymentId={parsedPaymentId.data} />
}

/** Suspense fallback shaped like the summary card, so the page doesn't flash empty. */
export function PaymentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}

function PaymentDetailContent({
  paymentId,
}: {
  readonly paymentId: PaymentId
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const appRun = useAppRun()
  const [resolvePending, setResolvePending] = useState(false)
  const [excessResolvePending, setExcessResolvePending] = useState(false)
  const query = paymentDetailQuery(paymentId)
  const reconciliationsQuery = paymentReconciliationsQuery(paymentId)
  const paymentNumberQuery = paymentNumberByPaymentIdQuery(paymentId)
  const { data: payments } = useEvoluQuery(query)
  const { data: reconciliations } = useEvoluQuery(reconciliationsQuery)
  const { data: paymentNumbers } = useEvoluQuery(paymentNumberQuery)
  const payment = payments[0]
  const paymentNumber = paymentNumbers[0]
  // Read before the early return below, so the hook order stays stable.
  // Nothing writes a row when a payment expires; see `useNow`.
  const now = useNow([payment?.expiresAt ?? null])

  if (!payment) {
    return <NotFoundCard messageKey="paymentDetail.notFound" />
  }

  const paymentStatus = derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: reconciliations.length > 0,
    now,
  })
  const isPending = paymentStatus === "pending"
  // The collision docs/bill-payment-states.md calls out: a multi-device
  // merge can leave a payment canceled with an active claim (real money) at
  // the same time — `derivePaymentStatus` still shows it as Canceled until
  // staff explicitly resolves it via `confirmPaymentPaidDespiteCancellation`.
  const hasCancellationCollision =
    payment.canceledAt !== null &&
    payment.confirmedPaidAt === null &&
    reconciliations.length > 0
  // The duplicate-settlement collision from docs/bill-payment-states.md: two
  // offline devices can each independently claim this payment through a
  // different method — both real money, so the sum of its distinct claimed
  // transactions can exceed its own `amount`. See `payment.ts`'s
  // `excessAcknowledgedAt` doc comment.
  const claimedTransactionSum = sumDistinctClaimedAmounts(
    reconciliations.flatMap((reconciliation) =>
      reconciliation.accountTransactionId === null
        ? []
        : [
            {
              accountTransactionId: reconciliation.accountTransactionId,
              amount: reconciliation.transactionAmount,
              currency: reconciliation.transactionCurrency,
              paymentAmount: payment.amount,
              paymentCurrency: payment.currency,
              paymentAmountSats: payment.amountSats,
            },
          ]
    )
  )
  const hasExcessSettlementCollision = derivePaymentHasExcessSettlement({
    amount: payment.amount,
    excessAcknowledgedAt: payment.excessAcknowledgedAt,
    claimedSum: claimedTransactionSum,
  })

  const handleConfirmPaidDespiteCancellation = async () => {
    setResolvePending(true)
    try {
      await using run = appRun()
      const result = await run(confirmPaymentPaidDespiteCancellation(paymentId))

      if (!result.ok) {
        toast.error(t("paymentDetail.collision.markPaid.error"))
      }
    } finally {
      setResolvePending(false)
    }
  }

  const handleAcknowledgeExcessSettlement = async () => {
    setExcessResolvePending(true)
    try {
      await using run = appRun()
      const result = await run(acknowledgePaymentExcessSettlement(paymentId))

      if (!result.ok) {
        toast.error(t("paymentDetail.excessCollision.acknowledge.error"))
      }
    } finally {
      setExcessResolvePending(false)
    }
  }

  const handleRefund = () => {
    toast.info(t("paymentDetail.collision.refund.comingSoon"))
  }
  const paymentMethodKinds = [
    ...new Set(
      reconciliations.map((reconciliation) => reconciliation.transactionKind)
    ),
  ]

  return (
    <div className="flex flex-col gap-4">
      {isPending ? (
        <div className="flex flex-col gap-1">
          <Button
            className="h-12"
            nativeButton={false}
            render={<Link to="/payment/$paymentId" params={{ paymentId }} />}
          >
            {t("paymentDetail.backToPayment")}
          </Button>
          {payment.expiresAt === null ? null : (
            <p className="text-center text-xs text-muted-foreground">
              {t("paymentDetail.expiresAt", {
                time: formatTime(new Date(payment.expiresAt), locale),
              })}
            </p>
          )}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          {paymentNumber ? (
            <CardTitle>
              {t("paymentDetail.number", {
                number: paymentNumber.serialNumber,
              })}
            </CardTitle>
          ) : null}
          <CardDescription>
            {formatDateTime(new Date(payment.createdAt), locale)}
          </CardDescription>
          <CardAction>
            <Badge
              variant={
                paymentStatus === "canceled" ? "destructive" : "secondary"
              }
              className={cn(paymentStatusBadgeClassName[paymentStatus])}
            >
              {t(paymentStatusLabelKey[paymentStatus])}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <strong className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatMoney(
                {
                  value: payment.amount,
                  currency: payment.currency,
                },
                locale
              )}
            </strong>
            {payment.tipAmount > 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("paymentDetail.tipIncluded", {
                  amount: formatMoney(
                    { value: payment.tipAmount, currency: payment.currency },
                    locale
                  ),
                })}
              </span>
            ) : null}
            {paymentMethodKinds.length > 0 ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
                {paymentMethodKinds.map((kind) => {
                  const Icon = paymentMethodIcon[kind]
                  return (
                    <span key={kind} className="inline-flex items-center gap-1">
                      <Icon aria-hidden className="size-4" />
                      {t(paymentMethodLabelKey[kind])}
                    </span>
                  )
                })}
              </span>
            ) : null}
            {payment.canceledAt === null ? null : (
              <span className="text-sm text-muted-foreground">
                {t("paymentDetail.canceledAtValue", {
                  date: formatDateTime(new Date(payment.canceledAt), locale),
                })}
              </span>
            )}
          </div>

          {hasCancellationCollision ? (
            <CollisionAlert
              title={t("paymentDetail.collision.title")}
              description={t("paymentDetail.collision.description")}
            >
              <Button
                className="h-12 flex-1"
                disabled={resolvePending}
                onClick={() => void handleConfirmPaidDespiteCancellation()}
              >
                {t("paymentDetail.collision.markPaid")}
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={handleRefund}
              >
                {t("paymentDetail.collision.refund")}
              </Button>
            </CollisionAlert>
          ) : null}

          {hasExcessSettlementCollision ? (
            <CollisionAlert
              title={t("paymentDetail.excessCollision.title")}
              description={t("paymentDetail.excessCollision.description")}
            >
              <Button
                className="h-12 flex-1"
                disabled={excessResolvePending}
                onClick={() => void handleAcknowledgeExcessSettlement()}
              >
                {t("paymentDetail.excessCollision.acknowledge")}
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={handleRefund}
              >
                {t("paymentDetail.collision.refund")}
              </Button>
            </CollisionAlert>
          ) : null}
        </CardContent>
      </Card>

      {payment.billId !== null ? (
        <PaymentDetailBillCard
          billId={payment.billId}
          paymentId={paymentId}
          tipAmount={payment.tipAmount}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentDetail.reconciliations")}</CardTitle>
        </CardHeader>
        <CardContent>
          {reconciliations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("paymentDetail.reconciliations.empty")}
            </p>
          ) : (
            <Timeline value={reconciliations.length}>
              {reconciliations.map((reconciliation, index) => (
                <TimelineItem key={reconciliation.id} step={index + 1}>
                  <TimelineHeader>
                    <TimelineDate>
                      {formatDateTime(
                        new Date(reconciliation.claimedAt),
                        locale
                      )}
                    </TimelineDate>
                    <TimelineTitle className="flex items-center gap-2">
                      {t(paymentMethodLabelKey[reconciliation.transactionKind])}
                      <Badge variant="secondary">
                        {t(claimSourceLabelKey[reconciliation.source])}
                      </Badge>
                    </TimelineTitle>
                  </TimelineHeader>
                  <TimelineIndicator />
                  <TimelineSeparator />
                  <TimelineContent>
                    <div className="mt-2 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
                      <PaymentDetailRow
                        label={t("paymentDetail.transaction.amount")}
                        value={formatMoney(
                          {
                            value: reconciliation.transactionAmount,
                            currency: reconciliation.transactionCurrency,
                          },
                          locale
                        )}
                        emphasize
                      />
                      <PaymentDetailOptionalRow
                        label={t("paymentDetail.transaction.account")}
                        value={
                          reconciliation.accountName ?? reconciliation.accountId
                        }
                      />
                      <PaymentDetailOptionalRow
                        label={t("paymentDetail.transaction.variableSymbol")}
                        value={reconciliation.variableSymbol}
                      />
                      <PaymentDetailOptionalRow
                        label={t("paymentDetail.transaction.note")}
                        value={reconciliation.transactionNote}
                      />
                      <PaymentDetailTechnical>
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.occurredAt")}
                          value={formatDateTime(
                            new Date(reconciliation.transactionOccurredAt),
                            locale
                          )}
                        />
                        {reconciliation.transactionRecordedAt ===
                        null ? null : (
                          <PaymentDetailRow
                            label={t("paymentDetail.transaction.recordedAt")}
                            value={formatDateTime(
                              new Date(reconciliation.transactionRecordedAt),
                              locale
                            )}
                          />
                        )}
                        {reconciliation.transactionSource === null ? null : (
                          <PaymentDetailRow
                            label={t("paymentDetail.transaction.source")}
                            value={t(
                              claimSourceLabelKey[
                                reconciliation.transactionSource
                              ]
                            )}
                          />
                        )}
                        <PaymentDetailCopyRow
                          label={t("paymentDetail.transaction.id")}
                          value={reconciliation.accountTransactionId}
                        />
                        <PaymentDetailCopyRow
                          label={t("paymentDetail.transaction.bankReference")}
                          value={reconciliation.bankReference}
                        />
                        <PaymentDetailCopyRow
                          label={t("paymentDetail.transaction.sparkTransferId")}
                          value={reconciliation.sparkTransferId}
                        />
                        <PaymentDetailCopyRow
                          label={t("paymentDetail.transaction.paymentHash")}
                          value={reconciliation.paymentHash}
                        />
                        <PaymentDetailCopyRow
                          label={t("paymentDetail.reconciliation.id")}
                          value={reconciliation.id}
                        />
                      </PaymentDetailTechnical>
                    </div>
                  </TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </CardContent>
      </Card>

      <PaymentDetailTechnical>
        <PaymentDetailCopyRow
          label={t("paymentDetail.id")}
          value={payment.id}
        />
        <PaymentDetailCopyRow
          label={t("paymentDetail.deviceId")}
          value={payment.deviceId}
        />
        {payment.updatedAt === null ? null : (
          <PaymentDetailRow
            label={t("paymentDetail.updatedAt")}
            value={formatDateTime(new Date(payment.updatedAt), locale)}
          />
        )}
      </PaymentDetailTechnical>
    </div>
  )
}

function PaymentDetailBillCard({
  billId,
  paymentId,
  tipAmount,
}: {
  readonly billId: BillId
  readonly paymentId: PaymentId
  readonly tipAmount: NonNegativeInteger
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const query = billByIdQuery(billId)
  const { data: bills } = useEvoluQuery(query)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)
  const summaries = useBillLineSummaries(billId)
  const billStatus = useBillStatus(billId)
  const { claimedSum, coverage } = useBillCoverage(billId)
  const lineDiff = useBillLineSummaryDiff(paymentId, billId)
  const claimedPaymentsQuery = claimedPaymentsByBillIdQuery(billId)
  const { data: claimedPayments } = useEvoluQuery(claimedPaymentsQuery)
  const bill = bills[0]

  if (!bill || billStatus === undefined) {
    return null
  }

  const table = tables.find((candidate) => candidate.id === bill.tableId)
  const totalAmount = deriveBillSummaryTotal(summaries)
  // Bill total plus this payment's tip, so the items list's own total
  // reconciles with `payment.amount` (see `calculatePaymentAmounts`) — kept
  // separate from `totalAmount`, which the coverage math below compares
  // against `claimedSum` (also tip-excluded, see `calculateClaimedSum`).
  const totalAmountWithTip = NonNegativeInteger(totalAmount + tipAmount)

  // Which of the two known causes actually explains this bill's coverage
  // mismatch (see docs/bill-payment-states.md's "Bill payment coverage"
  // section) — a bill-line change since this payment was made, or another
  // payment also claimed against the same bill. Neither is mutually
  // exclusive with the other collisions on this page, and either can be
  // absent (e.g. a payment created before the paymentLine snapshot existed),
  // in which case only the plain coverage fact is shown.
  const hasLineDiff =
    lineDiff !== null &&
    (lineDiff.added.length > 0 ||
      lineDiff.removed.length > 0 ||
      lineDiff.changed.length > 0)
  const otherClaimedPaymentIds = [
    ...new Set(claimedPayments.map((payment) => payment.id)),
  ].filter((id) => id !== paymentId)
  const coverageMismatchReason: BillCoverageMismatchReason | null = hasLineDiff
    ? "billLinesChanged"
    : otherClaimedPaymentIds.length > 0
      ? "multiplePayments"
      : null
  // An open bill with nothing claimed against it yet is also "underpaid" by
  // `deriveBillCoverage`'s definition, so warning on `coverage !== "paid"`
  // alone put "Bill underpaid — Expected 500,00 / Paid 0,00" on every
  // not-yet-settled bill payment, with no `coverageMismatchReason` to explain
  // it. Only flag underpayment once a partial payment has actually landed,
  // the same gate `BillHistoryIssues` and `resolvePaymentHistoryIssueFlags`
  // use for the list rows. Overpaid needs no gate: an unpaid bill is never
  // overpaid.
  const coverageWarning: "underpaid" | "overpaid" | null =
    coverage === "overpaid"
      ? "overpaid"
      : coverage === "underpaid" && claimedSum > 0
        ? "underpaid"
        : null
  const taxRecapRows = calculateTaxRecap(summaries, taxRates)
  const hasTaxRecap = hasTaxableLines(taxRecapRows)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paymentDetail.bill.title")}</CardTitle>
        <CardDescription>
          {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/activity/bills/$billId" params={{ billId }} />}
          >
            {t("paymentDetail.bill.open")}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("paymentDetail.bill.table")}
            </span>
            {/*
             * Spelled out rather than "—": a counter sale with no table is a
             * fact staff should read, not a missing value. "—" stays for a
             * tableId whose table row is gone (deleted since).
             */}
            <span
              className={cn(
                "text-sm font-medium",
                bill.tableId === null && "text-muted-foreground"
              )}
            >
              {bill.tableId === null
                ? t("paymentDetail.bill.noTable")
                : (table?.name ?? t("paymentDetail.emptyValue"))}
            </span>
          </div>
          <Badge
            variant={
              billStatus.status === "canceled" ? "destructive" : "secondary"
            }
            className={cn(billStatusBadgeClassName[billStatus.status])}
          >
            {t(billStatusLabelKey[billStatus.status])}
          </Badge>
        </div>

        {billStatus.hasCancellationCollision ? (
          <BillCancellationCollisionPanel billId={billId} />
        ) : null}

        <Separator />

        {summaries.length === 0 && tipAmount === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("paymentDetail.bill.empty")}
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {summaries.map((summary) => (
              <div
                key={summary.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{summary.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.quantity} ×{" "}
                    {formatMoney(
                      {
                        value: NonNegativeInteger(
                          summary.totalAmount / summary.quantity
                        ),
                        currency: summary.currency,
                      },
                      locale
                    )}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatMoney(
                    { value: summary.totalAmount, currency: summary.currency },
                    locale
                  )}
                </p>
              </div>
            ))}
            {tipAmount > 0 ? (
              <div className="flex items-center justify-between gap-2 py-2">
                <p className="text-sm font-medium">
                  {t("paymentDetail.tipAmount")}
                </p>
                <p className="text-sm font-semibold">
                  {formatMoney(
                    { value: tipAmount, currency: bill.currency },
                    locale
                  )}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {hasTaxRecap ? (
          <>
            <Separator />
            <TaxRecap
              rows={taxRecapRows}
              currency={bill.currency}
              locale={locale}
            />
          </>
        ) : null}

        <Separator />

        <PaymentDetailRow
          label={t("paymentDetail.bill.total")}
          value={formatMoney(
            { value: totalAmountWithTip, currency: bill.currency },
            locale
          )}
          emphasize
        />

        {coverageWarning === null ? null : (
          <BillCoverageWarning
            coverage={coverageWarning}
            expectedAmount={totalAmount}
            claimedSum={claimedSum}
            currency={bill.currency}
            reason={coverageMismatchReason}
          >
            {coverageMismatchReason === "multiplePayments" ? (
              <div className="flex w-full flex-col gap-2 border-t border-warning/30 pt-2">
                {otherClaimedPaymentIds.map((otherPaymentId, index) => (
                  <Button
                    key={otherPaymentId}
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link
                        to="/activity/$paymentId"
                        params={{ paymentId: otherPaymentId }}
                      />
                    }
                  >
                    {otherClaimedPaymentIds.length > 1
                      ? t("bill.collision.viewPayment.numbered", {
                          number: index + 1,
                        })
                      : t("bill.collision.viewPayment")}
                  </Button>
                ))}
              </div>
            ) : null}

            {hasLineDiff ? (
              <div className="flex w-full flex-col gap-1 border-t border-warning/30 pt-2">
                <span className="font-medium text-foreground">
                  {t("paymentDetail.bill.coverage.changesTitle")}
                </span>
                {lineDiff?.removed.map((summary) => (
                  <div
                    key={summary.id}
                    className="flex w-full items-center justify-between gap-4"
                  >
                    <span>
                      − {summary.quantity} × {summary.name}
                    </span>
                    <span>
                      {formatMoney(
                        {
                          value: summary.totalAmount,
                          currency: summary.currency,
                        },
                        locale
                      )}
                    </span>
                  </div>
                ))}
                {lineDiff?.added.map((summary) => (
                  <div
                    key={summary.id}
                    className="flex w-full items-center justify-between gap-4"
                  >
                    <span>
                      + {summary.quantity} × {summary.name}
                    </span>
                    <span>
                      {formatMoney(
                        {
                          value: summary.totalAmount,
                          currency: summary.currency,
                        },
                        locale
                      )}
                    </span>
                  </div>
                ))}
                {lineDiff?.changed.map(({ before, after }) => (
                  <div
                    key={after.id}
                    className="flex w-full items-center justify-between gap-4"
                  >
                    <span>{after.name}</span>
                    <span>
                      {formatMoney(
                        {
                          value: before.totalAmount,
                          currency: before.currency,
                        },
                        locale
                      )}
                      {" → "}
                      {formatMoney(
                        {
                          value: after.totalAmount,
                          currency: after.currency,
                        },
                        locale
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </BillCoverageWarning>
        )}
      </CardContent>
    </Card>
  )
}

/** Identifiers and bookkeeping timestamps staff rarely need, collapsed by default. */
export function PaymentDetailTechnical({
  children,
}: {
  readonly children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {t("paymentDetail.technical")}
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 transition-transform group-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function PaymentDetailCopyRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | null
}) {
  const { t } = useTranslation()

  if (value === null) return null

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-xs">{value}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("paymentDetail.copy", { label })}
          onClick={() =>
            void copyToClipboard(value, {
              copied: t("paymentDetail.copied"),
              failed: t("paymentDetail.copyError"),
            })
          }
        >
          <CopyIcon />
        </Button>
      </span>
    </div>
  )
}

function PaymentDetailOptionalRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | null
}) {
  if (value === null) return null

  return <PaymentDetailRow label={label} value={value} />
}

export function PaymentDetailRow({
  label,
  value,
  stacked,
  emphasize,
  children,
}: {
  readonly label: string
  readonly value?: string
  readonly stacked?: boolean
  readonly emphasize?: boolean
  readonly children?: ReactNode
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1 text-sm"
          : "flex items-start justify-between gap-4 text-sm"
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          stacked ? undefined : "max-w-56 break-all text-right",
          emphasize ? "font-semibold" : "font-medium"
        )}
      >
        {children ?? value}
      </span>
    </div>
  )
}
