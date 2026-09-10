import type { InferRow } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import { PaymentDetailRow } from "@/components/payment-detail.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"
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
import { confirmBillClosedDespiteCancellation } from "@/core/modules/bill/bill-actions.ts"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillStatus } from "@/core/modules/bill/bill-utils.ts"
import {
  calculateTaxRecap,
  hasTaxableLines,
} from "@/core/modules/bill-line/bill-line-tax-utils.ts"
import { deriveBillSummaryTotal } from "@/core/modules/bill-line/bill-line-utils.ts"
import { paymentsWithClaimsByBillIdQuery } from "@/core/modules/payment/payment-queries.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

const billDetailStatusBadgeClassName = {
  open: "bg-warning/10 text-warning",
  closed: "bg-success/10 text-success",
  canceled: null,
} satisfies Record<BillStatus, string | null>

const billDetailStatusLabelKey = {
  open: "paymentDetail.bill.status.open",
  closed: "paymentDetail.bill.status.closed",
  canceled: "paymentDetail.bill.status.canceled",
} satisfies Record<BillStatus, TranslationKey>

type BillDetailPaymentRowData = InferRow<
  ReturnType<typeof paymentsWithClaimsByBillIdQuery>
>

type BillDetailPaymentStatus = ReturnType<typeof derivePaymentStatus>

const billDetailPaymentStatusBadgeClassName = {
  canceled: null,
  paid: "bg-success/10 text-success",
  expired: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning",
} satisfies Record<BillDetailPaymentStatus, string | null>

/**
 * Mirrors `payment-history.tsx`'s `paymentStatusData`/`PaymentStatusIcon`: a
 * payment linked to this bill gets the same warning-triangle treatment there
 * when it's individually caught in the canceled+claimed collision from
 * docs/bill-payment-states.md, regardless of the bill's own collision status.
 */
const billDetailPaymentStatusIconData = {
  canceled: ["bg-destructive/10 text-destructive", <XIcon key="canceled" />],
  paid: ["bg-success/10 text-success", <CheckIcon key="paid" />],
  expired: ["bg-muted text-muted-foreground", <ClockIcon key="expired" />],
  pending: ["bg-warning/10 text-warning", <RotateCwIcon key="pending" />],
} satisfies Record<BillDetailPaymentStatus, readonly [string, ReactNode]>

function BillDetailPaymentStatusIcon({
  status,
  hasCancellationCollision,
}: {
  readonly status: BillDetailPaymentStatus
  readonly hasCancellationCollision: boolean
}) {
  const [className, icon] = hasCancellationCollision
    ? ["bg-warning/10 text-warning", <AlertTriangleIcon key="collision" />]
    : billDetailPaymentStatusIconData[status]

  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        className
      )}
    >
      {icon}
    </div>
  )
}

/**
 * Never a real transaction count column — this query's `claimCount` is
 * always a plain SQLite `COUNT()`, but some drivers return it as `bigint` or
 * `string` at runtime rather than `number`. Coerce once here, mirroring
 * `payment-history.tsx`'s `toClaimCount`.
 */
const toClaimCount = (value: number | string | bigint): number =>
  typeof value === "number" ? value : Number(value)

export function BillDetail({ billId }: { readonly billId: string }) {
  const parsedBillId = BillId.safeParse(billId)

  if (!parsedBillId.success) {
    return <BillDetailEmptyState messageKey="billDetail.invalidId" />
  }

  return <BillDetailContent billId={parsedBillId.data} />
}

function BillDetailContent({ billId }: { readonly billId: BillId }) {
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
  const paymentsQuery = useMemo(
    () => paymentsWithClaimsByBillIdQuery(billId),
    [billId]
  )
  const { data: payments } = useEvoluQuery(paymentsQuery)
  const bill = bills[0]

  if (!bill || billStatus === undefined) {
    return <BillDetailEmptyState messageKey="billDetail.notFound" />
  }

  const table = tables.find((candidate) => candidate.id === bill.tableId)
  const totalAmount = deriveBillSummaryTotal(summaries)
  const coverageDelta = NonNegativeInteger(Math.abs(totalAmount - claimedSum))
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </CardTitle>
          <CardDescription>{bill.id}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                {t("billDetail.total")}
              </span>
              <strong className="text-4xl font-semibold tracking-tight">
                {formatMoney(
                  { value: totalAmount, currency: bill.currency },
                  locale
                )}
              </strong>
            </div>
            <Badge
              variant={
                billStatus.status === "canceled" ? "destructive" : "secondary"
              }
              className={cn(billDetailStatusBadgeClassName[billStatus.status])}
            >
              {t(billDetailStatusLabelKey[billStatus.status])}
            </Badge>
          </div>

          {billStatus.status === "open" ? (
            <Button
              variant="outline"
              className="h-12"
              nativeButton={false}
              render={<Link to="/bill" search={{ billId }} />}
            >
              {t("billDetail.backToBill")}
            </Button>
          ) : null}

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

          <div className="flex flex-col gap-3">
            <PaymentDetailRow
              label={t("billDetail.table")}
              value={table?.name ?? t("billDetail.emptyValue")}
            />
            <PaymentDetailRow
              label={t("billDetail.createdAt")}
              value={formatDateTime(new Date(bill.createdAt), locale)}
            />
          </div>

          <Separator />

          {summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("billDetail.items.empty")}
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {summaries.map((summary) => (
                <div
                  key={summary.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {summary.name}
                    </p>
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
                      {
                        value: summary.totalAmount,
                        currency: summary.currency,
                      },
                      locale
                    )}
                  </p>
                </div>
              ))}
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

          {coverage === "paid" ? null : (
            <>
              <Separator />
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
                  </p>
                  <div className="flex w-full items-center justify-between gap-4">
                    <span>
                      {t("paymentDetail.bill.coverage.expectedAmount")}
                    </span>
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
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billDetail.payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("billDetail.payments.empty")}
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {payments.map((payment) => (
                <BillDetailPaymentRow
                  key={payment.id}
                  payment={payment}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BillDetailPaymentRow({
  payment,
  locale,
}: {
  readonly payment: BillDetailPaymentRowData
  readonly locale: string
}) {
  const { t } = useTranslation()
  const claimCount = toClaimCount(payment.claimCount)
  const now = useNow([payment.expiresAt])
  const status = derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: claimCount > 0,
    now,
  })
  // The collision docs/bill-payment-states.md calls out: a multi-device
  // merge can leave this payment canceled with an active claim (real money)
  // at the same time. Mirrors `payment-history.tsx`'s
  // `resolveHasCancellationCollision`.
  const hasCancellationCollision =
    payment.canceledAt !== null &&
    payment.confirmedPaidAt === null &&
    claimCount > 0

  return (
    <Link
      to="/activity/$paymentId"
      params={{ paymentId: payment.id }}
      className="-mx-1 flex items-center gap-3 rounded-md px-1 py-2 hover:bg-accent/50"
    >
      <BillDetailPaymentStatusIcon
        status={status}
        hasCancellationCollision={hasCancellationCollision}
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {formatMoney(
            { value: payment.amount, currency: payment.currency },
            locale
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(new Date(payment.createdAt), locale)}
        </span>
      </div>
      <Badge
        variant={status === "canceled" ? "destructive" : "secondary"}
        className={cn(billDetailPaymentStatusBadgeClassName[status])}
      >
        {t(`paymentDetail.status.${status}`)}
      </Badge>
    </Link>
  )
}

function BillDetailEmptyState({
  messageKey,
}: {
  readonly messageKey: "billDetail.invalidId" | "billDetail.notFound"
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
