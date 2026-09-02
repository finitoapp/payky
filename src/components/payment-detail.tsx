import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, ReceiptIcon } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { confirmPaymentPaidDespiteCancellation } from "@/core/modules/payment/payment-actions.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { paymentNumberByPaymentIdQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import type { BillStatus } from "@/core/modules/shared/schema.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
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

  if (!payment) {
    return <PaymentDetailEmptyState messageKey="paymentDetail.notFound" />
  }

  const paymentStatus = derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: reconciliations.length > 0,
    now: new Date(),
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
        <PaymentDetailBillCard billId={payment.billId} />
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

function PaymentDetailBillCard({ billId }: { readonly billId: BillId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const query = useMemo(() => billByIdQuery(billId), [billId])
  const { data: bills } = useEvoluQuery(query)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const summaries = useBillLineSummaries(billId)
  const bill = bills[0]

  if (!bill) {
    return null
  }

  const table = tables.find((candidate) => candidate.id === bill.tableId)
  const totalAmount = NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )

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
            variant={bill.status === "canceled" ? "destructive" : "secondary"}
            className={cn(billStatusBadgeClassName[bill.status])}
          >
            {t(billStatusLabelKey[bill.status])}
          </Badge>
        </div>

        <Separator />

        {summaries.length === 0 ? (
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
          </div>
        )}

        <Separator />

        <PaymentDetailRow
          label={t("paymentDetail.bill.total")}
          value={formatMoney(
            { value: totalAmount, currency: bill.currency },
            locale
          )}
          emphasize
        />
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
