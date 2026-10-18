import { rowsByCurrency } from "@payky/app-shared/stats-sections"
import { salesByDeviceQuery } from "@payky/core/modules/sales-stats/sales-stats-queries"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  CurrencyGroup,
  StatsBarRow,
  StatsSection,
  useStatsMoney,
} from "./stats-section.tsx"
import { type SalesStats, useStatsRows } from "./use-sales-stats.ts"

/**
 * Revenue and number of sales per device that took them — the closest the
 * app has to "per staff member". A payment without a device, or a device
 * without a name, is "Unknown device".
 */
export function DeviceBreakdown({ stats }: { readonly stats: SalesStats }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = useStatsMoney()
  const rows = useStatsRows(
    "salesByDevice",
    salesByDeviceQuery,
    stats.ranges.range,
    stats.live
  )

  if (rows === undefined || rows.length === 0) return null

  const groups = rowsByCurrency(rows, stats.accountCurrency)

  return (
    <StatsSection
      title={t("stats.devices.title")}
      className="flex flex-col gap-4"
    >
      {groups.map((group) => {
        const takings = (row: (typeof group.rows)[number]) =>
          row.gross + row.tips
        const total = group.rows.reduce((sum, row) => sum + takings(row), 0)
        return (
          <CurrencyGroup
            key={group.currency}
            currency={group.currency}
            showCurrency={groups.length > 1}
          >
            {group.rows.map((row) => (
              <StatsBarRow
                key={row.deviceId ?? "none"}
                label={row.deviceName ?? t("stats.devices.unknown")}
                detail={t("stats.devices.count", {
                  count: row.count.toLocaleString(locale),
                })}
                value={money(takings(row), group.currency)}
                tips={
                  row.tips === 0 ? undefined : money(row.tips, group.currency)
                }
                share={total === 0 ? 0 : takings(row) / total}
                tipsShare={takings(row) === 0 ? 0 : row.tips / takings(row)}
              />
            ))}
          </CurrencyGroup>
        )
      })}
    </StatsSection>
  )
}
