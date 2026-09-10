import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, ReceiptIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"
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
import { TaxRecap } from "@/components/tax-recap.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import { confirmBillClosedDespiteCancellation } from "@/core/modules/bill/bill-actions.ts"
import { claimedPaymentsByBillIdQuery } from "@/core/modules/bill/bill-coverage-queries.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillStatus } from "@/core/modules/bill/bill-utils.ts"
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
  calculatePaymentClaimedSum,
  derivePaymentHasExcessSettlement,
  derivePaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { paymentNumberByPaymentIdQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillLineSummaryDiff } from "@/features/bill/use-bill-line-summary-diff.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDate, formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentDetailPaymentMethod = "cashRegister" | "iban" | "onchain" | "spark"
type PaymentDetailClaimSource = "auto" | "manual"

const paymentDetailStatusBadgeClassName = {
  canceled: null,
  paid: "bg-success/10 text-success",
  expired: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning",
} satisfies Record<ReturnType<typeof derivePaymentStatus>, string | null>

const paymentMethodLabelKey = {
  cashRegister: "paymentDetail.paymentMethod.cash",
  iban: "paymentDetail.paymentMethod.iban",
  onchain: "paymentDetail.paymentMethod.onchain",
  spark: "paymentDetail.paymentMethod.spark",
} satisfies Record<PaymentDetailPaymentMethod, TranslationKey>

const claimSourceLabelKey = {
  auto: "paymentDetail.reconciliation.source.auto",
  manual: "paymentDetail.reconciliation.source.manual",
} satisfies Record<PaymentDetailClaimSource, TranslationKey>

const billStatusBadgeClassName = {
  open: "bg-warning/10 text-warning",
  closed: "bg-success/10 text-success",
  canceled: null,
} satisfies Record<BillStatus, string | null>

const billStatusLabelKey = {
  open: "paymentDetail.bill.status.open",
  closed: "paymentDetail.bill.status.closed",
  canceled: "paymentDetail.bill.status.canceled",
} satisfies Record<BillStatus, TranslationKey>

const paymentDetailQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select([
        "id",
        "deviceId",
        "billId",
        "tableId",
        "amount",
        "currency",
        "tipAmount",
        "canceledAt",
        "confirmedPaidAt",
        "excessAcknowledgedAt",
        "expiresAt",
        "createdAt",
        "updatedAt",
      ])
      .where("id", "=", paymentId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("amount", "is not", null)
      .where("currency", "is not", null)
      .where("tipAmount", "is not", null)
      .where("createdAt", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

const paymentReconciliationsQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .leftJoin("account", (join) =>
        join
          .onRef("account.id", "=", "accountTransaction.accountId")
          .on("account.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionSource", (join) =>
        join
          .onRef(
            "accountTransactionSource.accountTransactionId",
            "=",
            "accountTransaction.id"
          )
          .on("accountTransactionSource.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionIban", (join) =>
        join
          .onRef("accountTransactionIban.id", "=", "accountTransaction.id")
          .on("accountTransactionIban.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionSpark", (join) =>
        join
          .onRef("accountTransactionSpark.id", "=", "accountTransaction.id")
          .on("accountTransactionSpark.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionLightning", (join) =>
        join
          .onRef("accountTransactionLightning.id", "=", "accountTransaction.id")
          .on("accountTransactionLightning.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "reconciliationClaim.id",
        "reconciliationClaim.source",
        "reconciliationClaim.claimedAt",
        "reconciliationClaim.accountTransactionId",
        "accountTransaction.accountId",
        "accountTransaction.kind as transactionKind",
        "accountTransaction.amount as transactionAmount",
        "accountTransaction.currency as transactionCurrency",
        "accountTransaction.occurredAt as transactionOccurredAt",
        "accountTransaction.note as transactionNote",
        "account.name as accountName",
        "accountTransactionSource.source as transactionSource",
        "accountTransactionSource.recordedAt as transactionRecordedAt",
        "accountTransactionIban.variableSymbol",
        "accountTransactionIban.bankReference",
        "accountTransactionSpark.sparkTransferId",
        "accountTransactionLightning.paymentHash",
      ])
      .where("reconciliationClaim.paymentId", "=", paymentId)
      .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      .where("accountTransaction.isDeleted", "is not", sqliteTrue)
      .where("reconciliationClaim.source", "is not", null)
      .where("reconciliationClaim.claimedAt", "is not", null)
      .where("accountTransaction.kind", "is not", null)
      .where("accountTransaction.amount", "is not", null)
      .where("accountTransaction.currency", "is not", null)
      .where("accountTransaction.occurredAt", "is not", null)
      .orderBy("reconciliationClaim.claimedAt", "desc")
      .$narrowType<{
        source: KyselyNotNull
        claimedAt: KyselyNotNull
        transactionKind: KyselyNotNull
        transactionAmount: KyselyNotNull
        transactionCurrency: KyselyNotNull
        transactionOccurredAt: KyselyNotNull
      }>()
  )

export function PaymentDetail({ paymentId }: { readonly paymentId: string }) {
  const parsedPaymentId = PaymentId.safeParse(paymentId)

  if (!parsedPaymentId.success) {
    return <PaymentDetailEmptyState messageKey="paymentDetail.invalidId" />
  }

  return <PaymentDetailContent paymentId={parsedPaymentId.data} />
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
  const query = useMemo(() => paymentDetailQuery(paymentId), [paymentId])
  const reconciliationsQuery = useMemo(
    () => paymentReconciliationsQuery(paymentId),
    [paymentId]
  )
  const paymentNumberQuery = useMemo(
    () => paymentNumberByPaymentIdQuery(paymentId),
    [paymentId]
  )
  const { data: payments } = useEvoluQuery(query)
  const { data: reconciliations } = useEvoluQuery(reconciliationsQuery)
  const { data: paymentNumbers } = useEvoluQuery(paymentNumberQuery)
  const payment = payments[0]
  const paymentNumber = paymentNumbers[0]
  // Read before the early return below, so the hook order stays stable.
  // Nothing writes a row when a payment expires; see `useNow`.
  const now = useNow([payment?.expiresAt ?? null])

  if (!payment) {
    return <PaymentDetailEmptyState messageKey="paymentDetail.notFound" />
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
  const claimedTransactionSum = calculatePaymentClaimedSum(
    reconciliations.flatMap((reconciliation) =>
      reconciliation.accountTransactionId === null
        ? []
        : [
            {
              accountTransactionId: reconciliation.accountTransactionId,
              amount: reconciliation.transactionAmount,
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
  const paymentMethodValue =
    reconciliations.length === 0
      ? t("paymentDetail.paymentMethod.none")
      : Array.from(
          new Set(
            reconciliations.map((reconciliation) =>
              t(paymentMethodLabelKey[reconciliation.transactionKind])
            )
          )
        ).join(", ")

  return (
    <div className="flex flex-col gap-4">
      {isPending ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              to="/payment/$paymentId"
              params={{ paymentId }}
              aria-label={t("paymentDetail.backToPayment")}
            />
          }
        >
          {t("paymentDetail.backToPayment")}
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentDetail.title")}</CardTitle>
          <CardDescription>{payment.id}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                {t("paymentDetail.amount")}
              </span>
              <strong className="text-4xl font-semibold tracking-tight">
                {formatMoney(
                  {
                    value: payment.amount,
                    currency: payment.currency,
                  },
                  locale
                )}
              </strong>
            </div>
            <Badge
              variant={
                paymentStatus === "canceled" ? "destructive" : "secondary"
              }
              className={cn(paymentDetailStatusBadgeClassName[paymentStatus])}
            >
              {t(`paymentDetail.status.${paymentStatus}`)}
            </Badge>
          </div>

          {hasCancellationCollision ? (
            <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-warning">
                    {t("paymentDetail.collision.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("paymentDetail.collision.description")}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
              </div>
            </div>
          ) : null}

          {hasExcessSettlementCollision ? (
            <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-warning">
                    {t("paymentDetail.excessCollision.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("paymentDetail.excessCollision.description")}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
              </div>
            </div>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3">
            <PaymentDetailRow
              label={t("paymentDetail.tipAmount")}
              value={formatMoney(
                {
                  value: payment.tipAmount,
                  currency: payment.currency,
                },
                locale
              )}
            />
            <PaymentDetailRow
              label={t("paymentDetail.createdAt")}
              value={formatDateTime(new Date(payment.createdAt), locale)}
            />
            <PaymentDetailRow
              label={t("paymentDetail.updatedAt")}
              value={
                payment.updatedAt === null
                  ? t("paymentDetail.emptyValue")
                  : formatDateTime(new Date(payment.updatedAt), locale)
              }
            />
            <PaymentDetailRow
              label={t("paymentDetail.canceledAt")}
              value={
                payment.canceledAt === null
                  ? t("paymentDetail.emptyValue")
                  : formatDateTime(new Date(payment.canceledAt), locale)
              }
            />
            <PaymentDetailRow
              label={t("paymentDetail.paymentNumber.serialNumber")}
              value={
                paymentNumber
                  ? String(paymentNumber.serialNumber)
                  : t("paymentDetail.emptyValue")
              }
            />
            <PaymentDetailRow
              label={t("paymentDetail.paymentNumber.date")}
              value={
                paymentNumber
                  ? formatDate(
                      new Date(`${paymentNumber.date}T00:00:00`),
                      locale
                    )
                  : t("paymentDetail.emptyValue")
              }
            />
            <PaymentDetailRow
              label={t("paymentDetail.paymentMethod")}
              value={paymentMethodValue}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <PaymentDetailRow
              label={t("paymentDetail.deviceId")}
              value={payment.deviceId ?? t("paymentDetail.emptyValue")}
            />
          </div>
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
                    <TimelineTitle>
                      {t(paymentMethodLabelKey[reconciliation.transactionKind])}
                    </TimelineTitle>
                  </TimelineHeader>
                  <TimelineIndicator />
                  <TimelineSeparator />
                  <TimelineContent>
                    <div className="mt-2 rounded-lg border bg-muted/20 p-3">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <span className="break-all text-xs text-muted-foreground">
                          {reconciliation.id}
                        </span>
                        <Badge variant="secondary">
                          {t(claimSourceLabelKey[reconciliation.source])}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2">
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.id")}
                          value={
                            reconciliation.accountTransactionId ??
                            t("paymentDetail.emptyValue")
                          }
                        />
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.account")}
                          value={
                            reconciliation.accountName ??
                            reconciliation.accountId ??
                            t("paymentDetail.emptyValue")
                          }
                        />
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.amount")}
                          value={formatMoney(
                            {
                              value: reconciliation.transactionAmount,
                              currency: reconciliation.transactionCurrency,
                            },
                            locale
                          )}
                        />
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.occurredAt")}
                          value={formatDateTime(
                            new Date(reconciliation.transactionOccurredAt),
                            locale
                          )}
                        />
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.recordedAt")}
                          value={
                            reconciliation.transactionRecordedAt === null
                              ? t("paymentDetail.emptyValue")
                              : formatDateTime(
                                  new Date(
                                    reconciliation.transactionRecordedAt
                                  ),
                                  locale
                                )
                          }
                        />
                        <PaymentDetailRow
                          label={t("paymentDetail.transaction.source")}
                          value={
                            reconciliation.transactionSource === null
                              ? t("paymentDetail.emptyValue")
                              : t(
                                  claimSourceLabelKey[
                                    reconciliation.transactionSource
                                  ]
                                )
                          }
                        />
                        <PaymentDetailOptionalRow
                          label={t("paymentDetail.transaction.note")}
                          value={reconciliation.transactionNote}
                        />
                        <PaymentDetailOptionalRow
                          label={t("paymentDetail.transaction.variableSymbol")}
                          value={reconciliation.variableSymbol}
                        />
                        <PaymentDetailOptionalRow
                          label={t("paymentDetail.transaction.bankReference")}
                          value={reconciliation.bankReference}
                        />
                        <PaymentDetailOptionalRow
                          label={t("paymentDetail.transaction.sparkTransferId")}
                          value={reconciliation.sparkTransferId}
                        />
                        <PaymentDetailOptionalRow
                          label={t("paymentDetail.transaction.paymentHash")}
                          value={reconciliation.paymentHash}
                        />
                      </div>
                    </div>
                  </TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </CardContent>
      </Card>
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
  const appRun = useAppRun()
  const [resolvePending, setResolvePending] = useState(false)
  const query = useMemo(() => billByIdQuery(billId), [billId])
  const { data: bills } = useEvoluQuery(query)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)
  const summaries = useBillLineSummaries(billId)
  const billStatus = useBillStatus(billId)
  const { claimedSum, coverage } = useBillCoverage(billId)
  const lineDiff = useBillLineSummaryDiff(paymentId, billId)
  const claimedPaymentsQuery = useMemo(
    () => claimedPaymentsByBillIdQuery(billId),
    [billId]
  )
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
  const coverageMismatchReason: "billLinesChanged" | "multiplePayments" | null =
    hasLineDiff
      ? "billLinesChanged"
      : otherClaimedPaymentIds.length > 0
        ? "multiplePayments"
        : null
  const coverageDelta = NonNegativeInteger(Math.abs(totalAmount - claimedSum))
  // An open bill with nothing claimed against it yet is also "underpaid" by
  // `deriveBillCoverage`'s definition, so warning on `coverage !== "paid"`
  // alone put "Bill underpaid — Expected 500,00 / Paid 0,00" on every
  // not-yet-settled bill payment, with no `coverageMismatchReason` to explain
  // it. Only flag underpayment once a partial payment has actually landed,
  // the same gate `BillHistoryIssues` and `resolvePaymentHistoryIssueFlags`
  // use for the list rows. Overpaid needs no gate: an unpaid bill is never
  // overpaid.
  const showCoverageWarning =
    coverage === "overpaid" || (coverage === "underpaid" && claimedSum > 0)
  const taxRecapRows = calculateTaxRecap(summaries, taxRates)
  const hasTaxRecap = hasTaxableLines(taxRecapRows)

  const handleConfirmClosedDespiteCancellation = async () => {
    setResolvePending(true)
    try {
      await using run = appRun()
      const result = await run(confirmBillClosedDespiteCancellation(billId))

      if (!result.ok) {
        toast.error(t("bill.collision.markClosed.error"))
      }
    } finally {
      setResolvePending(false)
    }
  }

  const handleRefund = () => {
    toast.info(t("bill.collision.refund.comingSoon"))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paymentDetail.bill.title")}</CardTitle>
        <CardDescription>
          {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("paymentDetail.bill.table")}
            </span>
            <span className="text-sm font-medium">
              {table?.name ?? t("paymentDetail.emptyValue")}
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
          <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-warning">
                  {t("bill.collision.title")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("bill.collision.description")}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-12 flex-1"
                disabled={resolvePending}
                onClick={() => void handleConfirmClosedDespiteCancellation()}
              >
                {t("bill.collision.markClosed")}
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={handleRefund}
              >
                {t("bill.collision.refund")}
              </Button>
            </div>
          </div>
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

        {showCoverageWarning ? (
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertTitle>
              {t(
                coverage === "underpaid"
                  ? "paymentDetail.bill.coverage.underpaid.title"
                  : "paymentDetail.bill.coverage.overpaid.title"
              )}
            </AlertTitle>
            <AlertDescription>
              <p className="text-sm font-semibold text-foreground">
                {t(
                  coverage === "underpaid"
                    ? "paymentDetail.bill.coverage.delta.underpaid"
                    : "paymentDetail.bill.coverage.delta.overpaid",
                  {
                    amount: formatMoney(
                      { value: coverageDelta, currency: bill.currency },
                      locale
                    ),
                  }
                )}
              </p>
              <p>
                {t(
                  coverage === "underpaid"
                    ? "paymentDetail.bill.coverage.underpaid.fact"
                    : "paymentDetail.bill.coverage.overpaid.fact"
                )}
                {coverageMismatchReason === null
                  ? null
                  : ` ${t(`paymentDetail.bill.coverage.reason.${coverageMismatchReason}`)}`}
              </p>
              <div className="flex w-full items-center justify-between gap-4">
                <span>{t("paymentDetail.bill.coverage.expectedAmount")}</span>
                <span className="font-medium text-foreground">
                  {formatMoney(
                    { value: totalAmount, currency: bill.currency },
                    locale
                  )}
                </span>
              </div>
              <div className="flex w-full items-center justify-between gap-4">
                <span>{t("paymentDetail.bill.coverage.paidAmount")}</span>
                <span className="font-medium text-foreground">
                  {formatMoney(
                    { value: claimedSum, currency: bill.currency },
                    locale
                  )}
                </span>
              </div>

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
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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

function PaymentDetailEmptyState({
  messageKey,
}: {
  readonly messageKey: "paymentDetail.invalidId" | "paymentDetail.notFound"
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <ReceiptIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t(messageKey)}</p>
      </CardContent>
    </Card>
  )
}
