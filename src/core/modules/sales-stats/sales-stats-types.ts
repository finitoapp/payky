import type { DateIso } from "@evolu/common"

/**
 * A half-open `[fromIso, toIso)` range of UTC ISO instants, as Evolu stores
 * `createdAt`. Every sales-stats query takes one; `statsPeriodRanges` in
 * `sales-stats-utils.ts` builds them from the local calendar.
 */
export interface StatsRange {
  readonly fromIso: DateIso
  readonly toIso: DateIso
}

/** The period selector's choices. Custom dates are `yyyy-MM-dd`, both inclusive. */
export type StatsPeriod =
  | { readonly kind: "today" }
  | { readonly kind: "yesterday" }
  | { readonly kind: "last7Days" }
  | { readonly kind: "monthToDate" }
  | { readonly kind: "custom"; readonly from: string; readonly to: string }
