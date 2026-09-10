import type { InferRow } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { NotFoundCard } from "@/components/not-found-card.tsx"
import { PaymentDetailRow } from "@/components/payment-detail.tsx"
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
import { BillCancellationCollisionPanel } from "@/features/bill/bill-cancellation-collision-panel.tsx"
import { BillCoverageWarning } from "@/features/bill/bill-coverage-warning.tsx"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
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
 * `paymentsWithClaimsByBillIdQuery` selects `claimCount` through
 * `eb.fn.count<number>(...)`, and that type argument is an assertion rather
 * than a guarantee: SQLite drivers return `COUNT()` as `bigint` or `string`
 * depending on the build. Coerce once, at the one place the repo still uses
 * `COUNT` — `payment-history.tsx` dropped its own copy of this when it
 * replaced the count with an embedded array it could take `.length` of.
 */
const toClaimCount = (value: number | string | bigint): number =>
  typeof value === "number" ? value : Number(value)

export function BillDetail({ billId }: { readonly billId: string }) {
  const parsedBillId = BillId.safeParse(billId)

  if (!parsedBillId.success) {
    return <NotFoundCard messageKey="billDetail.invalidId" />
  }

  return <BillDetailContent billId={parsedBillId.data} />
}

function BillDetailContent({ billId }: { readonly billId: BillId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const query = billByIdQuery(billId)
  const { data: bills } = useEvoluQuery(query)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)
  const summaries = useBillLineSummaries(billId)
  const billStatus = useBillStatus(billId)
  const { claimedSum, coverage } = useBillCoverage(billId)
  const paymentsQuery = paymentsWithClaimsByBillIdQuery(billId)
  const { data: payments } = useEvoluQuery(paymentsQuery)
  const bill = bills[0]

  if (!bill || billStatus === undefined) {
    return <NotFoundCard messageKey="billDetail.notFound" />
  }

  const table = tables.find((candidate) => candidate.id === bill.tableId)
  const totalAmount = deriveBillSummaryTotal(summaries)
  const taxRecapRows = calculateTaxRecap(summaries, taxRates)
  const hasTaxRecap = hasTaxableLines(taxRecapRows)

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
            <BillCancellationCollisionPanel billId={billId} />
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
              <BillCoverageWarning
                coverage={coverage}
                expectedAmount={totalAmount}
                claimedSum={claimedSum}
                currency={bill.currency}
              />
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
