import { describe, expect, test } from "vitest"

import { resolveStationsOverviewRange } from "./stations-overview-range.ts"

const now = new Date(2026, 9, 7, 15, 30)
const day = (date: number) => new Date(2026, 9, date).getTime()

describe("resolveStationsOverviewRange", () => {
  test("covers whole local days up to the end of today", () => {
    expect(resolveStationsOverviewRange("today", now)).toEqual({
      from: day(7),
      to: day(8),
    })
    expect(resolveStationsOverviewRange("yesterday", now)).toEqual({
      from: day(6),
      to: day(7),
    })
    expect(resolveStationsOverviewRange("last7Days", now)).toEqual({
      from: day(1),
      to: day(8),
    })
    expect(resolveStationsOverviewRange("last30Days", now)).toEqual({
      from: new Date(2026, 8, 8).getTime(),
      to: day(8),
    })
  })
})
