import { type Currency, Integer } from "@payky/core/modules/shared/schema"
import type { ReactNode } from "react"
import {
  verticalNavShellClassName,
  verticalNavTitleClassName,
} from "@/components/vertical-nav.tsx"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
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
/**
 * "of which tips" under a row whose amount holds them, the same sub-line
 * the expected cash shows.
 */
export function TipsLine({ children }: { readonly children: string }) {
  const { t } = useTranslation()

  return (
    <div className="-mt-1 flex justify-between gap-2 pl-6 text-xs text-muted-foreground">
      <span>{t("stats.tips.ofWhich")}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

/**
 * A row's bar: `share` of the full width, its last `tipsShare` in the
 * lighter tips shade the revenue chart stacks on top of its bars. Tall
 * enough for a few-percent tip to show at all.
 */
export function StatsBar({
  share,
  tipsShare = 0,
}: {
  /** 0..1 */
  readonly share: number
  /** 0..1 of the bar */
  readonly tipsShare?: number
}) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div
        className="flex h-full overflow-hidden rounded-full"
        style={{ width: `${(share * 100).toFixed(1)}%` }}
      >
        <div className="h-full flex-1 bg-chart-1" />
        {tipsShare > 0 ? (
          <div
            className="h-full bg-chart-1/45"
            style={{ width: `${(tipsShare * 100).toFixed(1)}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

export function StatsBarRow({
  label,
  detail,
  value,
  tips,
  share,
  tipsShare,
}: {
  readonly label: string
  readonly detail?: string
  readonly value: string
  /** The tips inside `value`, formatted; the line hides for none. */
  readonly tips?: string
  /** 0..1 */
  readonly share: number
  /** 0..1, the part of the row's own amount that is tips. */
  readonly tipsShare?: number
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
      {tips === undefined ? null : <TipsLine>{tips}</TipsLine>}
      <StatsBar share={share} tipsShare={tipsShare} />
    </div>
  )
}
