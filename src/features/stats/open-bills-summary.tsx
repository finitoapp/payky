import { useMemo } from "react"

import { openBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import {
  calculateBillLineSummaries,
  deriveBillSummaryTotal,
} from "@/core/modules/bill-line/bill-line-utils.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { StatsSection } from "./stats-section.tsx"

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
    <StatsSection
      title={t("stats.openBills.title")}
      className="grid grid-cols-2 gap-2"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {t("stats.openBills.count")}
        </p>
        <p className="text-base font-semibold tabular-nums">
          {openBills.length.toLocaleString(locale)}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {t("stats.openBills.total")}
        </p>
        {totals.map(([currency, total]) => (
          <p key={currency} className="text-base font-semibold tabular-nums">
            {formatMoney({ value: Integer(total), currency }, locale)}
          </p>
        ))}
      </div>
    </StatsSection>
  )
}
