import type { ReactNode } from "react"

import {
  verticalNavShellClassName,
  verticalNavTitleClassName,
} from "@/components/vertical-nav.tsx"
import { orderCurrencies } from "@/core/modules/sales-stats/sales-stats-utils.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

/** One block of the statistics screen: a titled card, an optional note under it. */
export function StatsSection({
  title,
  note,
  className,
  children,
}: {
  readonly title: string
  readonly note?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className={verticalNavShellClassName}>
        <h2 className={verticalNavTitleClassName}>{title}</h2>
        <div className={cn("px-4 pb-4", className)}>{children}</div>
      </div>
      {note === undefined ? null : (
        <p className="px-1 text-xs text-muted-foreground">{note}</p>
      )}
    </section>
  )
}

/**
 * Rows split per currency, the account currency first, as the KPI tiles do.
 * Sections never add amounts across currencies.
 */
export const rowsByCurrency = <R extends { readonly currency: Currency }>(
  rows: ReadonlyArray<R>,
  accountCurrency: Currency
): ReadonlyArray<{
  readonly currency: Currency
  readonly rows: ReadonlyArray<R>
}> =>
  orderCurrencies(
    rows.map((row) => row.currency),
    accountCurrency
  ).map((currency) => ({
    currency,
    rows: rows.filter((row) => row.currency === currency),
  }))

export const useStatsMoney = () => {
  const locale = useLocale()
  return (value: number, currency: Currency) =>
    formatMoney({ value: Integer(value), currency }, locale)
}

/** One currency's rows, headed by the currency when the period has several. */
export function CurrencyGroup({
  currency,
  showCurrency,
  children,
}: {
  readonly currency: Currency
  readonly showCurrency: boolean
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {showCurrency ? (
        <p className="text-xs font-bold text-muted-foreground">{currency}</p>
      ) : null}
      {children}
    </div>
  )
}

/** A labelled figure with a bar for its share, as the payment methods show. */
export function StatsBarRow({
  label,
  detail,
  value,
  share,
}: {
  readonly label: string
  readonly detail?: string
  readonly value: string
  /** 0..1 */
  readonly share: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {detail === undefined ? null : (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {detail}
          </span>
        )}
        <span className="shrink-0 text-right font-medium tabular-nums">
          {value}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-chart-1"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
    </div>
  )
}
