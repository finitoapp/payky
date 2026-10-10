import { expect, test } from "vitest"

import { StatsSearchSchema, statsPeriodFromSearch } from "./stats-search.ts"

const now = new Date("2026-10-10T14:00:00+02:00")
const periodOf = (search: unknown) =>
  statsPeriodFromSearch(StatsSearchSchema.parse(search), now)

test("no or unknown period is today", () => {
  expect(periodOf({})).toEqual({ kind: "today" })
  expect(periodOf({ period: "decade" })).toEqual({ kind: "today" })
  expect(periodOf({ period: "monthToDate" })).toEqual({ kind: "monthToDate" })
})

test("a custom range keeps its days, swapped when reversed", () => {
  expect(
    periodOf({ period: "custom", from: "2026-09-01", to: "2026-09-30" })
  ).toEqual({ kind: "custom", from: "2026-09-01", to: "2026-09-30" })
  expect(
    periodOf({ period: "custom", from: "2026-09-30", to: "2026-09-01" })
  ).toEqual({ kind: "custom", from: "2026-09-01", to: "2026-09-30" })
})

test("a custom range missing or with an impossible day falls back", () => {
  expect(periodOf({ period: "custom", from: "2026-09-01" })).toEqual({
    kind: "custom",
    from: "2026-09-01",
    to: "2026-09-01",
  })
  expect(
    periodOf({ period: "custom", from: "2026-02-30", to: "nope" })
  ).toEqual({ kind: "custom", from: "2026-10-10", to: "2026-10-10" })
})
