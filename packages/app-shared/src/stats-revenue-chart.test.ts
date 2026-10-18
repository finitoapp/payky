import { expect, test } from "vitest"

import { revenueChartPoints } from "./stats-revenue-chart.ts"

const bucket = (iso: string, gross: number, tips = 0) => ({
  start: new Date(iso),
  count: 1,
  gross,
  tips,
})

test("revenueChartPoints pairs buckets by position, in major units", () => {
  expect(
    revenueChartPoints({
      current: [
        bucket("2026-10-10T08:00:00Z", 12_345, 655),
        bucket("2026-10-10T09:00:00Z", 0),
      ],
      previous: [bucket("2026-10-03T08:00:00Z", 5_000, 1_000)],
      currency: "CZK",
      now: new Date("2026-10-10T12:00:00Z"),
    })
  ).toEqual([
    {
      start: Date.parse("2026-10-10T08:00:00Z"),
      sales: 123.45,
      tips: 6.55,
      // The comparison is the whole takings: sales and tips.
      previous: 60,
      previousSales: 50,
      previousTips: 10,
      previousStart: Date.parse("2026-10-03T08:00:00Z"),
    },
    {
      start: Date.parse("2026-10-10T09:00:00Z"),
      sales: 0,
      tips: 0,
      previous: undefined,
      previousSales: undefined,
      previousTips: undefined,
      previousStart: undefined,
    },
  ])
})

test("revenueChartPoints leaves the buckets still ahead of now without a bar", () => {
  const [past, ahead] = revenueChartPoints({
    current: [
      bucket("2026-10-10T08:00:00Z", 1_000),
      bucket("2026-10-10T09:00:00Z", 0),
    ],
    previous: [
      bucket("2026-10-03T08:00:00Z", 2_000),
      bucket("2026-10-03T09:00:00Z", 3_000),
    ],
    currency: "CZK",
    now: new Date("2026-10-10T08:30:00Z"),
  })
  expect(past?.sales).toBe(10)
  expect(ahead).toMatchObject({
    sales: undefined,
    tips: undefined,
    previous: 30,
  })
})
