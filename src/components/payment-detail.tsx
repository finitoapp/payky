import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import { ReceiptIcon } from "lucide-react"
import { useMemo } from "react"
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
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentDetailStatus = "canceled" | "paid" | "pending"
type PaymentDetailPaymentMethod = "cashRegister" | "iban" | "spark"
type PaymentDetailClaimSource = "auto" | "manual"

const paymentDetailStatusBadgeClassName = {
  canceled: null,
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
} satisfies Record<PaymentDetailStatus, string | null>

const paymentMethodLabelKey = {
  cashRegister: "paymentDetail.paymentMethod.cash",
  iban: "paymentDetail.paymentMethod.iban",
  spark: "paymentDetail.paymentMethod.spark",
} satisfies Record<PaymentDetailPaymentMethod, TranslationKey>

const claimSourceLabelKey = {
  auto: "paymentDetail.reconciliation.source.auto",
  manual: "paymentDetail.reconciliation.source.manual",
} satisfies Record<PaymentDetailClaimSource, TranslationKey>

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
        "accountTransactionSpark.paymentHash",
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
  const query = useMemo(() => paymentDetailQuery(paymentId), [paymentId])
  const reconciliationsQuery = useMemo(
    () => paymentReconciliationsQuery(paymentId),
    [paymentId]
  )
  const { data: payments } = useEvoluQuery(query)
  const { data: reconciliations } = useEvoluQuery(reconciliationsQuery)
  const payment = payments[0]

  if (!payment) {
    return <PaymentDetailEmptyState messageKey="paymentDetail.notFound" />
  }

  const paymentStatus: PaymentDetailStatus =
    payment.canceledAt !== null
      ? "canceled"
      : reconciliations.length > 0
        ? "paid"
        : "pending"
  const isPending = paymentStatus === "pending"
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
            <PaymentDetailRow
              label={t("paymentDetail.billId")}
              value={payment.billId ?? t("paymentDetail.emptyValue")}
            />
            <PaymentDetailRow
              label={t("paymentDetail.tableId")}
              value={payment.tableId ?? t("paymentDetail.emptyValue")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentDetail.reconciliations")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {reconciliations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("paymentDetail.reconciliations.empty")}
            </p>
          ) : (
            reconciliations.map((reconciliation) => (
              <div
                key={reconciliation.id}
                className="rounded-lg border bg-muted/20 p-3"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">
                      {t(paymentMethodLabelKey[reconciliation.transactionKind])}
                    </span>
                    <span className="break-all text-xs text-muted-foreground">
                      {reconciliation.id}
                    </span>
                  </div>
                  <Badge variant="secondary">
                    {t(claimSourceLabelKey[reconciliation.source])}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2">
                  <PaymentDetailRow
                    label={t("paymentDetail.reconciliation.claimedAt")}
                    value={formatDateTime(
                      new Date(reconciliation.claimedAt),
                      locale
                    )}
                  />
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
                            new Date(reconciliation.transactionRecordedAt),
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
            ))
          )}
        </CardContent>
      </Card>
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

function PaymentDetailRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-56 break-all text-right font-medium">{value}</span>
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
