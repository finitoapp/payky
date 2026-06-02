import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { ReceiptIcon, RotateCwIcon, XIcon } from "lucide-react"
import type { FC, ReactNode } from "react"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import type { PaymentRow } from "@/core/modules/payment/payment.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query"
import { useTranslation } from "@/i18n/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentHistoryStatus = "canceled" | "pending"

const latestPaymentsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .select([
      "id",
      "amount",
      "currency",
      "tipAmount",
      "canceledAt",
      "createdAt",
    ])
    .where("isDeleted", "is not", sqliteTrue)
    .where("amount", "is not", null)
    .where("currency", "is not", null)
    .where("tipAmount", "is not", null)
    .where("createdAt", "is not", null)
    .orderBy("createdAt", "desc")
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
  pending: ["bg-warning/10 text-warning", <RotateCwIcon key="pending" />],
} satisfies Record<PaymentHistoryStatus, readonly [string, ReactNode]>

const PaymentStatusIcon: FC<{
  readonly paymentStatus: PaymentHistoryStatus
}> = (props) => {
  const [className, icon] = paymentStatusData[props.paymentStatus]

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

const resolvePaymentStatus = (payment: Pick<PaymentRow, "canceledAt">) =>
  payment.canceledAt === null ? "pending" : "canceled"

export const PaymentHistory = () => {
  const { t } = useTranslation()
  const { data: items } = useEvoluQuery(latestPaymentsQuery)

  const navItems = items.length === 0 ? ([false] as const) : items

  return (
    <VerticalNav
      title={t("paymentHistory.title")}
      items={navItems.map((item) => {
        if (item === false) {
          return {
            disableAction: true,
            label: (
              <div
                className={
                  "flex flex-col justify-center items-center gap-8 py-10"
                }
              >
                <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
                <h2 className={"text-foreground text-lg"}>
                  {t("paymentHistory.empty.title")}
                </h2>
                <p className="text-balance text-sm text-muted-foreground text-center">
                  {t("paymentHistory.empty.description")}
                </p>
              </div>
            ),
          }
        }

        return {
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
                    {formatMoney({
                      value: item.amount,
                      currency: item.currency,
                    })}
                  </span>
                  &nbsp;&nbsp;•&nbsp;&nbsp;
                  <span className={"text-muted-foreground"}>
                    {formatDateTime(new Date(item.createdAt))}
                  </span>
                </div>
              </div>
            </div>
          ),
          icon: (
            <div className={"p-2"}>
              <PaymentStatusIcon paymentStatus={resolvePaymentStatus(item)} />
            </div>
          ),
          action: (
            <span className="text-xs font-medium text-muted-foreground">
              {t(
                item.canceledAt === null
                  ? "paymentHistory.status.pending"
                  : "paymentHistory.status.canceled"
              )}
            </span>
          ),
        }
      })}
    />
  )
}
