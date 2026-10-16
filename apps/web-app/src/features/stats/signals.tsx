import {
  type SalesSignal,
  type SignalsRow,
  signalsQuery,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import { orderCurrencies } from "@payky/core/modules/sales-stats/sales-stats-utils"
import type { Currency } from "@payky/core/modules/shared/schema"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { CurrencyGroup, StatsSection, useStatsMoney } from "./stats-section.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

const signalOrder: ReadonlyArray<SalesSignal> = [
  "canceledPayment",
  "canceledBill",
  "manualIban",
]

const signalLabelKeys = {
  canceledPayment: "stats.signals.canceledPayment",
  canceledBill: "stats.signals.canceledBill",
  manualIban: "stats.signals.manualIban",
} satisfies Record<SalesSignal, TranslationKey>

export interface SignalFigures {
  readonly currency: Currency
  readonly signals: ReadonlyArray<{
    readonly signal: SalesSignal
    readonly count: number
    readonly amount: number
  }>
}

/**
 * Every signal per currency, in a fixed order, zero where nothing happened,
 * so "none" reads as a number too. Without any row, one set of zeros in the
 * account currency.
 */
export const signalFigures = (
  rows: ReadonlyArray<SignalsRow>,
  accountCurrency: Currency
): ReadonlyArray<SignalFigures> =>
  orderCurrencies(
    [accountCurrency, ...rows.map((row) => row.currency)],
    accountCurrency
  ).map((currency) => ({
    currency,
    signals: signalOrder.map((signal) => {
      const row = rows.find(
        (candidate) =>
          candidate.currency === currency && candidate.signal === signal
      )
      return { signal, count: row?.count ?? 0, amount: row?.amount ?? 0 }
    }),
  }))

/**
 * Cancelled payments, cancelled bills and bank transfers confirmed by hand
 * in the period: count and amount each, numbers only (no links).
 */
export function Signals({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useStatsMoney()
  const rows = useStatsRows(
    "signals",
    signalsQuery,
    stats.ranges.range,
    stats.live
  )

  if (rows === undefined) return null

  const groups = signalFigures(rows, stats.accountCurrency)

  return (
    <StatsSection
      title={t("stats.signals.title")}
      className="flex flex-col gap-4"
    >
      {groups.map((group) => (
        <CurrencyGroup
          key={group.currency}
          currency={group.currency}
          showCurrency={groups.length > 1}
        >
          <dl className="flex flex-col gap-1.5 text-sm">
            {group.signals.map(({ signal, count, amount }) => (
              <div key={signal} className="flex justify-between gap-2">
                <dt className="min-w-0">{t(signalLabelKeys[signal])}</dt>
                <dd
                  className={
                    count === 0
                      ? "shrink-0 text-muted-foreground tabular-nums"
                      : "shrink-0 font-medium tabular-nums"
                  }
                >
                  {t("stats.signals.value", {
                    count: count.toLocaleString(locale),
                    amount: money(amount, group.currency),
                  })}
                </dd>
              </div>
            ))}
          </dl>
        </CurrencyGroup>
      ))}
    </StatsSection>
  )
}
