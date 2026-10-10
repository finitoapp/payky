import { CircleHelpIcon } from "lucide-react"

import type {
  ExpectedCash,
  MethodBreakdown as MethodBreakdownRow,
  MethodShare,
} from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import {
  paymentMethodIcon,
  paymentMethodLabelKey,
} from "@/features/shared/payment-method-display.tsx"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"
import { StatsSection } from "./stats-section.tsx"

const useMoney = () => {
  const locale = useLocale()
  return (value: number, currency: Currency) =>
    formatMoney({ value: Integer(value), currency }, locale)
}

/**
 * Amount and share per method that settled the period's sales, per
 * currency. A duplicate settlement makes the methods exceed revenue; the
 * note names the excess.
 */
export function MethodBreakdown({
  methods,
}: {
  readonly methods: ReadonlyArray<MethodBreakdownRow>
}) {
  const { t } = useTranslation()
  const money = useMoney()
  const excess = methods.filter((row) => row.excess > 0)

  return (
    <StatsSection
      title={t("stats.methods.title")}
      className="flex flex-col gap-4"
      note={
        excess.length === 0
          ? undefined
          : excess
              .map((row) =>
                t("stats.methods.excess", {
                  amount: money(row.excess, row.currency),
                })
              )
              .join(" ")
      }
    >
      {methods.map((row) => (
        <div key={row.currency} className="flex flex-col gap-3">
          {methods.length > 1 ? (
            <p className="text-xs font-bold text-muted-foreground">
              {row.currency}
            </p>
          ) : null}
          {row.methods.map((method) => (
            <MethodRow
              key={method.method}
              method={method}
              currency={row.currency}
            />
          ))}
        </div>
      ))}
    </StatsSection>
  )
}

function MethodRow({
  method,
  currency,
}: {
  readonly method: MethodShare
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useMoney()
  const Icon =
    method.method === "unknown"
      ? CircleHelpIcon
      : paymentMethodIcon[method.method]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {method.method === "unknown"
            ? t("stats.methods.unknown")
            : t(paymentMethodLabelKey[method.method])}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {new Intl.NumberFormat(locale, {
            style: "percent",
            maximumFractionDigits: 0,
          }).format(method.share)}
        </span>
        <span className="w-24 text-right font-medium tabular-nums">
          {money(method.amount, currency)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-chart-1"
          style={{ width: `${Math.round(method.share * 100)}%` }}
        />
      </div>
    </div>
  )
}

/** The drawer's movement over the period, per currency that had any cash. */
export function ExpectedCashSummary({
  cash,
}: {
  readonly cash: ReadonlyArray<ExpectedCash>
}) {
  const { t } = useTranslation()
  const money = useMoney()

  if (cash.length === 0) return null

  return (
    <StatsSection
      title={t("stats.cash.title")}
      className="flex flex-col gap-4"
      note={t("stats.cash.note")}
    >
      {cash.map((row) => (
        <dl key={row.currency} className="flex flex-col gap-1.5 text-sm">
          {cash.length > 1 ? (
            <p className="text-xs font-bold text-muted-foreground">
              {row.currency}
            </p>
          ) : null}
          <CashLine label={t("stats.cash.in")}>
            {money(row.cashIn, row.currency)}
          </CashLine>
          <CashLine label={t("stats.cash.tips")} sub>
            {money(row.cashTips, row.currency)}
          </CashLine>
          <CashLine label={t("stats.cash.refunds")}>
            {money(-row.cashRefunds, row.currency)}
          </CashLine>
          <CashLine label={t("stats.cash.expected")} total>
            {money(row.expected, row.currency)}
          </CashLine>
        </dl>
      ))}
    </StatsSection>
  )
}

function CashLine({
  label,
  sub = false,
  total = false,
  children,
}: {
  readonly label: string
  readonly sub?: boolean
  readonly total?: boolean
  readonly children: string
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-2",
        sub && "pl-4 text-xs text-muted-foreground",
        total && "mt-1 border-t pt-2 font-semibold"
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}
