import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { ReceiptIcon } from "lucide-react"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge.tsx"
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
import { useTranslation } from "@/i18n/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"

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
  const query = useMemo(() => paymentDetailQuery(paymentId), [paymentId])
  const { data: payments } = useEvoluQuery(query)
  const payment = payments[0]

  if (!payment) {
    return <PaymentDetailEmptyState messageKey="paymentDetail.notFound" />
  }

  const statusKey =
    payment.canceledAt === null
      ? "paymentDetail.status.pending"
      : "paymentDetail.status.canceled"

  return (
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
              {formatMoney({
                value: payment.amount,
                currency: payment.currency,
              })}
            </strong>
          </div>
          <Badge
            variant={payment.canceledAt === null ? "secondary" : "destructive"}
          >
            {t(statusKey)}
          </Badge>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <PaymentDetailRow
            label={t("paymentDetail.tipAmount")}
            value={formatMoney({
              value: payment.tipAmount,
              currency: payment.currency,
            })}
          />
          <PaymentDetailRow
            label={t("paymentDetail.createdAt")}
            value={formatDateTime(new Date(payment.createdAt))}
          />
          <PaymentDetailRow
            label={t("paymentDetail.updatedAt")}
            value={
              payment.updatedAt === null
                ? t("paymentDetail.emptyValue")
                : formatDateTime(new Date(payment.updatedAt))
            }
          />
          <PaymentDetailRow
            label={t("paymentDetail.canceledAt")}
            value={
              payment.canceledAt === null
                ? t("paymentDetail.emptyValue")
                : formatDateTime(new Date(payment.canceledAt))
            }
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
  )
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
