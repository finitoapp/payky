import { expect, test } from "vitest"

import { revenueChartPoints } from "./revenue-chart.tsx"

const bucket = (iso: string, gross: number) => ({
  start: new Date(iso),
  count: 1,
  gross,
  tips: 0,
})

test("revenueChartPoints pairs buckets by position, in major units", () => {
  expect(
    revenueChartPoints({
      current: [
        bucket("2026-10-10T08:00:00Z", 12_345),
        bucket("2026-10-10T09:00:00Z", 0),
      ],
      previous: [bucket("2026-10-03T08:00:00Z", 5_000)],
      currency: "CZK",
    })
  ).toEqual([
    {
      start: Date.parse("2026-10-10T08:00:00Z"),
      current: 123.45,
      previous: 50,
    },
    {
      start: Date.parse("2026-10-10T09:00:00Z"),
      current: 0,
      previous: undefined,
    },
  ])
})
