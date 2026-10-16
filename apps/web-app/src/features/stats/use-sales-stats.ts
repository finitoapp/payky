import type { Query, QueryRows, Row } from "@evolu/common"
import type { EvoluSchema } from "@payky/core/evolu/schema"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import {
  refundsQuery,
  type SalesByHourRow,
  salesByHourQuery,
  salesByMethodQuery,
} from "@payky/core/modules/sales-stats/sales-stats-queries"
import type {
  StatsPeriod,
  StatsRange,
} from "@payky/core/modules/sales-stats/sales-stats-types"
import {
  type ExpectedCash,
  expectedCash,
  type MethodBreakdown,
  methodBreakdown,
  type SalesKpis,
  type StatsPeriodRanges,
  salesKpis,
  statsPeriodRanges,
} from "@payky/core/modules/sales-stats/sales-stats-utils"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { TimestampMs } from "@payky/core/modules/shared/schema"
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useEvolu } from "@/hooks/use-evolu.ts"
import {
  useEvoluQuery,
  useOptionalEvoluQuery,
} from "@/hooks/use-evolu-query.ts"
import { useNow } from "@/hooks/use-now.ts"

const tickMs = 5 * 60_000

/**
 * The clock the screen's ranges are built from. It ticks on every 5-minute
 * boundary, which local midnight always is, so *Today* rolls over at
 * midnight and the to-date comparisons (*Today*, *Month*) keep pace with
 * the live figures they are set against.
 *
 * ponytail: a to-date comparison trails `now` by up to 5 minutes; tick
 * every minute if anyone ever notices.
 */
export const useStatsNow = (): Date =>
  useNow([TimestampMs(Math.ceil((Date.now() + 1) / tickMs) * tickMs)])

/**
 * One sales-stats query over `range`, `undefined` while it loads. `live`
 * subscribes through `useEvoluQuery` (suspending on the first load), which
 * re-runs after every write and sync — only *Today* needs that. Everything
 * else loads once through TanStack Query and again on every return to the
 * screen. `name` keys the cache (`["stats", name, fromIso, toIso]`), so it
 * must be unique per query factory.
 */
export function useStatsRows<R extends Row>(
  name: string,
  createQuery: (range: StatsRange) => Query<EvoluSchema, R>,
  { fromIso, toIso }: StatsRange,
  live: boolean
): QueryRows<R> | undefined {
  const evolu = useEvolu()
  const query = useMemo(
    () => createQuery({ fromIso, toIso }),
    [createQuery, fromIso, toIso]
  )
  const { data: liveRows } = useOptionalEvoluQuery(live ? query : null)
  const { data: loadedRows } = useQuery({
    queryKey: ["stats", name, fromIso, toIso],
    queryFn: () => evolu.loadQuery(query),
    enabled: !live,
    refetchOnMount: "always",
  })
  return live ? liveRows : loadedRows
}

/**
 * When the period's figures last loaded, epoch ms, `undefined` before the
 * first load. Reads the sales-by-hour entry, which every non-live period
 * loads; re-renders whenever any stats load settles.
 */
export function useStatsLoadedAt({
  fromIso,
  toIso,
}: StatsRange): number | undefined {
  const queryClient = useQueryClient()
  useIsFetching({ queryKey: ["stats"] })
  const loadedAt = queryClient.getQueryState([
    "stats",
    "salesByHour",
    fromIso,
    toIso,
  ])?.dataUpdatedAt
  return loadedAt === undefined || loadedAt === 0 ? undefined : loadedAt
}

export interface SalesStats {
  readonly ranges: StatsPeriodRanges
  /** Whether `ranges.range` is subscribed — pass it to `useStatsRows`. */
  readonly live: boolean
  readonly accountCurrency: FiatCurrency
  readonly hourRows: ReadonlyArray<SalesByHourRow>
  readonly comparisonHourRows: ReadonlyArray<SalesByHourRow>
  /** Over `ranges.comparisonWhole`, for the chart. */
  readonly comparisonWholeHourRows: ReadonlyArray<SalesByHourRow>
  /** Per currency, the account currency first; empty for an empty period. */
  readonly kpis: ReadonlyArray<SalesKpis>
  readonly comparisonKpis: ReadonlyArray<SalesKpis>
  readonly methods: ReadonlyArray<MethodBreakdown>
  readonly cash: ReadonlyArray<ExpectedCash>
}

/**
 * The figures of the screen's first sections for `period`, `null` while any
 * of them loads. The comparison period is never live: it is in the past.
 */
export function useSalesStats(
  period: StatsPeriod,
  now: Date
): SalesStats | null {
  const ranges = statsPeriodRanges(period, now)
  const live = period.kind === "today"
  const { range, comparison, comparisonWhole } = ranges

  const {
    data: [settings],
  } = useEvoluQuery(settingsQuery)
  const accountCurrency = getFiatCurrency(settings)

  const hourRows = useStatsRows("salesByHour", salesByHourQuery, range, live)
  const methodRows = useStatsRows(
    "salesByMethod",
    salesByMethodQuery,
    range,
    live
  )
  const refundRows = useStatsRows("refunds", refundsQuery, range, live)
  const comparisonHourRows = useStatsRows(
    "salesByHour",
    salesByHourQuery,
    comparison,
    false
  )
  // The same cache entry as `comparisonHourRows` unless the period is to-date.
  const comparisonWholeHourRows = useStatsRows(
    "salesByHour",
    salesByHourQuery,
    comparisonWhole,
    false
  )
  const comparisonRefundRows = useStatsRows(
    "refunds",
    refundsQuery,
    comparison,
    false
  )

  const derived = useMemo(() => {
    if (
      hourRows === undefined ||
      methodRows === undefined ||
      refundRows === undefined ||
      comparisonHourRows === undefined ||
      comparisonWholeHourRows === undefined ||
      comparisonRefundRows === undefined
    ) {
      return null
    }
    return {
      hourRows,
      comparisonHourRows,
      comparisonWholeHourRows,
      kpis: salesKpis({ hourRows, refundRows, accountCurrency }),
      comparisonKpis: salesKpis({
        hourRows: comparisonHourRows,
        refundRows: comparisonRefundRows,
        accountCurrency,
      }),
      methods: methodBreakdown({ methodRows, hourRows, accountCurrency }),
      cash: expectedCash({ methodRows, refundRows, accountCurrency }),
    }
  }, [
    hourRows,
    methodRows,
    refundRows,
    comparisonHourRows,
    comparisonWholeHourRows,
    comparisonRefundRows,
    accountCurrency,
  ])

  return derived === null ? null : { ranges, live, accountCurrency, ...derived }
}
