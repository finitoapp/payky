import { AlertTriangleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge.tsx"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  type AccountTransactionKind,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import {
  paymentMethodIcon,
  paymentMethodLabelKey,
} from "@/features/payment/payment-method-display.tsx"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney, formatRelativeDate } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/**
 * The pieces a payment row (`PaymentHistory`) and a bill row
 * (`BillHistory`) share, so the two activity tabs read the same way.
 */

/**
 * An inset stripe, not a border, so a flagged row keeps the exact width and
 * alignment of the rest.
 */
export const activityIssueRowClassName =
  "shadow-[inset_3px_0_0_var(--color-warning)]"

/** A day's total, one sum per currency — the fiat currency is a setting, so one day can mix them. */
const formatCurrencyTotals = (
  amounts: ReadonlyArray<Money>,
  locale: string
): string | null => {
  const totals = new Map<Money["currency"], number>()
  for (const { value, currency } of amounts) {
    totals.set(currency, (totals.get(currency) ?? 0) + value)
  }
  if (totals.size === 0) return null

  return Array.from(totals, ([currency, value]) =>
    formatMoney({ value: NonNegativeInteger(value), currency }, locale)
  ).join(" + ")
}

/**
 * "Today · $12.00". `isComplete` is false for the last group while more
 * pages are still to load — that day may continue on the next page, so its
 * total would undercount and is left off until it's whole.
 */
export const formatActivityDayTitle = ({
  date,
  now,
  locale,
  amounts,
  isComplete,
}: {
  readonly date: Date
  readonly now: Date
  readonly locale: string
  readonly amounts: ReadonlyArray<Money>
  readonly isComplete: boolean
}): string => {
  const dayLabel = formatRelativeDate(date, now, locale)
  const totals = isComplete ? formatCurrencyTotals(amounts, locale) : null
  return totals === null ? dayLabel : `${dayLabel} · ${totals}`
}

export function ActivityIssueBadges({
  issues,
}: {
  readonly issues: ReadonlyArray<string>
}) {
  if (issues.length === 0) return null

  return (
    <span className="flex flex-wrap gap-1">
      {issues.map((issue) => (
        <Badge key={issue} className="bg-warning/10 text-warning">
          <AlertTriangleIcon aria-hidden />
          {issue}
        </Badge>
      ))}
    </span>
  )
}

export function PaymentMethodIcons({
  kinds,
}: {
  readonly kinds: ReadonlyArray<AccountTransactionKind>
}) {
  const { t } = useTranslation()

  if (kinds.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1">
      {Array.from(new Set(kinds), (kind) => {
        const Icon = paymentMethodIcon[kind]
        const label = t(paymentMethodLabelKey[kind])
        return (
          <span key={kind} title={label}>
            <Icon aria-hidden className="size-3.5" />
            <span className="sr-only">{label}</span>
          </span>
        )
      })}
    </span>
  )
}

/** The row's right column: the amount, bold, over its status label. */
export function ActivityAmount({
  money,
  isVoid,
  statusLabel,
}: {
  readonly money: Money
  /** Struck through: money that never arrived and never will. */
  readonly isVoid: boolean
  readonly statusLabel: string
}) {
  const locale = useLocale()

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          isVoid && "text-muted-foreground line-through"
        )}
      >
        {formatMoney(money, locale)}
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {statusLabel}
      </span>
    </div>
  )
}
