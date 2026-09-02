import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import type { FC, ReactNode } from "react"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  derivePaymentStatus,
  type PaymentStatus,
} from "@/core/modules/payment/payment-status-utils.ts"
import type { TimestampMs } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * `eb.fn.count<number>(...)` below only asserts the output type to
 * TypeScript — some SQLite drivers actually return COUNT() as a `bigint` or
 * `string` at runtime. Coerce once here, at the query boundary, instead of
 * letting the driver-dependent union leak into `PaymentHistoryStatusInput`.
 */
const toClaimCount = (value: number | string | bigint): number =>
  typeof value === "number" ? value : Number(value)

const latestPaymentsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .leftJoin("reconciliationClaim", (join) =>
      join
        .onRef("reconciliationClaim.paymentId", "=", "payment.id")
        .on("reconciliationClaim.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "payment.id",
      "payment.amount",
      "payment.currency",
      "payment.tipAmount",
      "payment.canceledAt",
      "payment.confirmedPaidAt",
      "payment.expiresAt",
      "payment.createdAt",
    ])
    .select((eb) =>
      eb.fn.count<number>("reconciliationClaim.id").as("claimCount")
    )
    .where("payment.isDeleted", "is not", sqliteTrue)
    .where("payment.amount", "is not", null)
    .where("payment.currency", "is not", null)
    .where("payment.tipAmount", "is not", null)
    .where("payment.createdAt", "is not", null)
    .groupBy([
      "payment.id",
      "payment.amount",
      "payment.currency",
      "payment.tipAmount",
      "payment.canceledAt",
      "payment.confirmedPaidAt",
      "payment.expiresAt",
      "payment.createdAt",
    ])
    .orderBy("payment.createdAt", "desc")
    .limit(50)
    .$narrowType<{
      amount: KyselyNotNull
      currency: KyselyNotNull
      tipAmount: KyselyNotNull
      createdAt: KyselyNotNull
    }>()
)

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
  readonly canceledAt: TimestampMs | null
  readonly confirmedPaidAt: TimestampMs | null
  readonly expiresAt: TimestampMs | null
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
  readonly canceledAt: TimestampMs | null
  readonly confirmedPaidAt: TimestampMs | null
  readonly claimCount: number
}): boolean =>
  payment.canceledAt !== null &&
  payment.confirmedPaidAt === null &&
  payment.claimCount > 0

export const PaymentHistory = () => {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: items } = useEvoluQuery(latestPaymentsQuery)

  return (
    <VerticalNav
      title={t("paymentHistory.title")}
      empty={
        <div
          className={"flex flex-col justify-center items-center gap-8 py-10"}
        >
          <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
          <h2 className={"text-foreground text-lg"}>
            {t("paymentHistory.empty.title")}
          </h2>
          <p className="text-balance text-sm text-muted-foreground text-center">
            {t("paymentHistory.empty.description")}
          </p>
        </div>
      }
      items={items.map((item) => {
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
                <div className={"flex justify-between w-full text-xs"}>
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
                    {formatDateTime(new Date(item.createdAt), locale)}
                  </span>
                </div>
                {hasCancellationCollision ? (
                  <span className="text-xs font-medium text-warning">
                    {t("paymentHistory.collision")}
                  </span>
                ) : null}
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
  )
}
