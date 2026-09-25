import type { InferRow } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import { NotFoundCard } from "@/components/not-found-card.tsx"
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
import { Separator } from "@/components/ui/separator.tsx"
import { billByIdQuery } from "@/core/modules/bill/bill-queries.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
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
import {
  billStatusBadgeClassName,
  billStatusLabelKey,
} from "@/features/bill/bill-status-display.ts"
import { TaxRecap } from "@/features/bill/tax-recap.tsx"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import {
  PaymentDetailCopyRow,
  PaymentDetailRow,
  PaymentDetailTechnical,
} from "@/features/payment/payment-detail.tsx"
import {
  PaymentStatusIcon,
  paymentStatusBadgeClassName,
  paymentStatusLabelKey,
} from "@/features/payment/payment-status-display.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type BillDetailPaymentRowData = InferRow<
  ReturnType<typeof paymentsWithClaimsByBillIdQuery>
>

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

  const closedOrCanceledLabel =
    billStatus.status === "closed" && bill.closedAt !== null
      ? t("billDetail.closedAtValue", {
          date: formatDateTime(new Date(bill.closedAt), locale),
        })
      : billStatus.status === "canceled" && bill.canceledAt !== null
        ? t("billDetail.canceledAtValue", {
            date: formatDateTime(new Date(bill.canceledAt), locale),
          })
        : null

  return (
    <div className="flex flex-col gap-4">
      {billStatus.status === "open" ? (
        <Button
          className="h-12"
          nativeButton={false}
          render={<Link to="/bill" search={{ billId }} />}
        >
          {t("billDetail.backToBill")}
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </CardTitle>
          <CardDescription>
            {formatDateTime(new Date(bill.createdAt), locale)}
          </CardDescription>
          <CardAction>
            <Badge
              variant={
                billStatus.status === "canceled" ? "destructive" : "secondary"
              }
              className={cn(billStatusBadgeClassName[billStatus.status])}
            >
              {t(billStatusLabelKey[billStatus.status])}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <strong className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatMoney(
                { value: totalAmount, currency: bill.currency },
                locale
              )}
            </strong>
            {closedOrCanceledLabel === null ? null : (
              <span className="text-sm text-muted-foreground">
                {closedOrCanceledLabel}
              </span>
            )}
          </div>

          {/*
           * Spelled out rather than "—": a counter sale with no table is a
           * fact staff should read, not a missing value. "—" stays for a
           * tableId whose table row is gone (deleted since).
           */}
          <PaymentDetailRow label={t("billDetail.table")}>
            {bill.tableId === null ? (
              <span className="text-muted-foreground">
                {t("billDetail.noTable")}
              </span>
            ) : (
              (table?.name ?? t("billDetail.emptyValue"))
            )}
          </PaymentDetailRow>

          {billStatus.hasCancellationCollision ? (
            <BillCancellationCollisionPanel billId={billId} />
          ) : null}

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

      <PaymentDetailTechnical>
        <PaymentDetailCopyRow label={t("billDetail.id")} value={bill.id} />
        <PaymentDetailCopyRow
          label={t("paymentDetail.deviceId")}
          value={bill.deviceId}
        />
        {bill.updatedAt === null ? null : (
          <PaymentDetailRow
            label={t("paymentDetail.updatedAt")}
            value={formatDateTime(new Date(bill.updatedAt), locale)}
          />
        )}
      </PaymentDetailTechnical>
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
      <PaymentStatusIcon
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
        className={cn(paymentStatusBadgeClassName[status])}
      >
        {t(paymentStatusLabelKey[status])}
      </Badge>
    </Link>
  )
}
