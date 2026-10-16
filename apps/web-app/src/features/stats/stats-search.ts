import type { StatsPeriod } from "@payky/core/modules/sales-stats/sales-stats-types"
import { format } from "date-fns"
import { z } from "zod"

export const statsPeriodKinds = [
  "today",
  "yesterday",
  "last7Days",
  "monthToDate",
  "custom",
] as const satisfies ReadonlyArray<StatsPeriod["kind"]>

/**
 * `/stats`'s search params: the selected period, so Back and reload keep it.
 * Every field falls back instead of throwing — a `validateSearch` throw on a
 * stale or hand-typed link would escape to the global error boundary.
 * `z.iso.date()` rejects impossible days (`2026-02-30`), which `parseISO`
 * would turn into an invalid `Date`.
 */
export const StatsSearchSchema = z.object({
  period: z.enum(statsPeriodKinds).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
})
export type StatsSearch = z.output<typeof StatsSearchSchema>

/**
 * The period the search params select, *Today* by default. A custom range
 * missing a day takes the other one (or today), and reversed days swap.
 */
export const statsPeriodFromSearch = (
  search: StatsSearch,
  now: Date
): StatsPeriod => {
  const kind = search.period ?? "today"
  if (kind !== "custom") return { kind }

  const today = format(now, "yyyy-MM-dd")
  const from = search.from ?? search.to ?? today
  const to = search.to ?? search.from ?? today
  return from <= to ? { kind, from, to } : { kind, from: to, to: from }
}
