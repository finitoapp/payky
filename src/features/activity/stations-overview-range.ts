import { addDays, startOfDay } from "date-fns"

import { TimestampMs } from "@/core/modules/shared/schema.ts"

export const stationsOverviewRanges = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
] as const

export type StationsOverviewRange = (typeof stationsOverviewRanges)[number]

/** Each range's first day and the day after its last, counted from today. */
const rangeDayOffsets = {
  today: [0, 1],
  yesterday: [-1, 0],
  last7Days: [-6, 1],
  last30Days: [-29, 1],
} satisfies Record<StationsOverviewRange, readonly [number, number]>

/** `[from, to)` in whole local days: "last 7 days" is today and the six before. */
export const resolveStationsOverviewRange = (
  range: StationsOverviewRange,
  now: Date
): { readonly from: TimestampMs; readonly to: TimestampMs } => {
  const today = startOfDay(now)
  const [fromOffset, toOffset] = rangeDayOffsets[range]

  return {
    from: TimestampMs(addDays(today, fromOffset).getTime()),
    to: TimestampMs(addDays(today, toOffset).getTime()),
  }
}
