import type { InferRow } from "@evolu/common"
import {
  AlertTriangleIcon,
  CheckIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { latestBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillStatus } from "@/core/modules/bill/bill-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useBillCoverage } from "@/features/bill/use-bill-coverage.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useBillStatus } from "@/features/bill/use-bill-status.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type BillHistoryRow = InferRow<typeof latestBillsQuery>

const billStatusIconData = {
  open: ["bg-warning/10 text-warning", <RotateCwIcon key="open" />],
  closed: ["bg-success/10 text-success", <CheckIcon key="closed" />],
  canceled: ["bg-destructive/10 text-destructive", <XIcon key="canceled" />],
} satisfies Record<BillStatus, readonly [string, ReactNode]>

function BillStatusIcon({
  status,
  hasCancellationCollision,
}: {
  readonly status: BillStatus
  readonly hasCancellationCollision: boolean
}) {
  const [className, icon] = hasCancellationCollision
    ? ["bg-warning/10 text-warning", <AlertTriangleIcon key="collision" />]
    : billStatusIconData[status]

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

/**
 * Everything this bill row should flag, joined with " · " — the
 * canceled+funded collision (see docs/bill-payment-states.md), and coverage
 * being off. Overpaid is always worth flagging; underpaid is only flagged
 * once a partial payment has actually landed (`claimedSum > 0`) — an
 * ordinary open cart with nothing paid yet is also "underpaid" by
 * definition, and flagging every one of those would drown out the genuine
 * signal (see the "reading the combination" table in
 * docs/bill-payment-states.md).
 */
function BillHistoryIssues({ billId }: { readonly billId: BillId }) {
  const { t } = useTranslation()
  const billStatus = useBillStatus(billId)
  const { claimedSum, coverage } = useBillCoverage(billId)

  const issues = [
    billStatus?.hasCancellationCollision ? t("bill.collision.title") : null,
    coverage === "overpaid" ? t("billHistory.overpaid") : null,
    coverage === "underpaid" && claimedSum > 0
      ? t("billHistory.underpaid")
      : null,
  ].filter((issue): issue is string => issue !== null)

  if (issues.length === 0) return null

  return (
    <span className="text-xs font-medium text-warning">
      {issues.join(" · ")}
    </span>
  )
}

/**
 * Reproduces the icon/label/action layout `NavItemContent` (`vertical-nav.tsx`)
 * and `PaymentHistory` build from separate `item` slots — bill rows can't use
 * those slots directly since every piece (icon, amount, status text) needs
 * its own `useBillStatus`/`useBillLineSummaries` subscription, which only
 * one component render can host, not a plain `.map()` callback. Assembling
 * the equivalent DOM by hand here, instead, is what keeps a bill row visually
 * identical to a payment row.
 */
function BillHistoryItemContent({ bill }: { readonly bill: BillHistoryRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const summaries = useBillLineSummaries(bill.id)
  const billStatus = useBillStatus(bill.id)
  const totalAmount = NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  )

  if (billStatus === undefined) return null

  return (
    <div className={"flex items-center gap-3 w-full"}>
      <div className={"p-2"}>
        <BillStatusIcon
          status={billStatus.status}
          hasCancellationCollision={billStatus.hasCancellationCollision}
        />
      </div>
      <div className={"flex gap-2 justify-between w-full"}>
        <div className={"flex flex-col gap-2 items-start w-max"}>
          <strong>
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </strong>
          <div className={"flex justify-between w-full text-xs"}>
            <span>
              {formatMoney(
                { value: totalAmount, currency: bill.currency },
                locale
              )}
            </span>
            &nbsp;&nbsp;•&nbsp;&nbsp;
            <span className={"text-muted-foreground"}>
              {formatDateTime(new Date(bill.createdAt), locale)}
            </span>
          </div>
          <BillHistoryIssues billId={bill.id} />
        </div>
      </div>
      <div className={"pl-2"}>
        <span className="text-xs font-medium text-muted-foreground">
          {t(`billHistory.status.${billStatus.status}`)}
        </span>
      </div>
    </div>
  )
}

export const BillHistory = () => {
  const { t } = useTranslation()
  const { data: items } = useEvoluQuery(latestBillsQuery)

  return (
    <VerticalNav
      title={t("billHistory.title")}
      empty={
        <div
          className={"flex flex-col justify-center items-center gap-8 py-10"}
        >
          <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
          <h2 className={"text-foreground text-lg"}>
            {t("billHistory.empty.title")}
          </h2>
          <p className="text-balance text-sm text-muted-foreground text-center">
            {t("billHistory.empty.description")}
          </p>
        </div>
      }
      items={items.map((bill) => ({
        id: bill.id,
        kind: "link" as const,
        to: "/activity/bills/$billId",
        params: { billId: bill.id },
        disableAction: true,
        label: <BillHistoryItemContent bill={bill} />,
      }))}
    />
  )
}
