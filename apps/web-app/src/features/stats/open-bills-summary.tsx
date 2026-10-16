import { openBillsQuery } from "@payky/core/modules/bill/bill-queries"
import {
  calculateBillLineSummaries,
  deriveBillSummaryTotal,
} from "@payky/core/modules/bill-line/bill-line-utils"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { Integer } from "@payky/core/modules/shared/schema"
import { useMemo } from "react"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * How many bills are open right now and what is on them, whatever the
 * period. Live, from the same `openBillsQuery` the floor view reads.
 *
 * ponytail: the total is the bills' lines, a partial payment on an open
 * bill not subtracted; subtract coverage if "still to collect" is wanted.
 */
export function OpenBillsSummary({
  accountCurrency,
}: {
  readonly accountCurrency: FiatCurrency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: openBills } = useEvoluQuery(openBillsQuery)

  const totals = useMemo(() => {
    const byCurrency = new Map<FiatCurrency, number>()
    for (const bill of openBills) {
      const total = deriveBillSummaryTotal(
        calculateBillLineSummaries(bill.lines, bill.items)
      )
      byCurrency.set(
        bill.currency,
        (byCurrency.get(bill.currency) ?? 0) + total
      )
    }
    if (byCurrency.size === 0) byCurrency.set(accountCurrency, 0)
    return [...byCurrency]
  }, [openBills, accountCurrency])

  return (
    <section className="flex items-center justify-between gap-3 rounded-md bg-card p-3 shadow">
      <h2 className="min-w-0 text-sm font-medium">
        {t("stats.openBills.title")}
      </h2>
      <dl className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <div>
          <dt className="sr-only">{t("stats.openBills.count")}</dt>
          <dd className="text-base font-semibold">
            {openBills.length.toLocaleString(locale)}
          </dd>
        </div>
        <div className="flex items-baseline gap-2 text-sm text-muted-foreground before:content-['·']">
          <dt className="sr-only">{t("stats.openBills.total")}</dt>
          {totals.map(([currency, total]) => (
            <dd key={currency}>
              {formatMoney({ value: Integer(total), currency }, locale)}
            </dd>
          ))}
        </div>
      </dl>
    </section>
  )
}
