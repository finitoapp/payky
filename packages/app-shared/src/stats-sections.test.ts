import { expect, test } from "vitest"
import { heatmapOpacity, rowsByCurrency } from "./stats-sections.ts"

test("rowsByCurrency splits rows per currency, the account currency first", () => {
  const rows = [
    { currency: "EUR", n: 1 },
    { currency: "CZK", n: 2 },
    { currency: "EUR", n: 3 },
  ] as const
  expect(rowsByCurrency(rows, "CZK")).toEqual([
    { currency: "CZK", rows: [rows[1]] },
    { currency: "EUR", rows: [rows[0], rows[2]] },
  ])
})

test("heatmapOpacity: empty is 0, busiest is 1, the rest above a floor", () => {
  expect(heatmapOpacity(0, 100)).toBe(0)
  expect(heatmapOpacity(0, 0)).toBe(0)
  expect(heatmapOpacity(100, 100)).toBe(1)
  expect(heatmapOpacity(1, 100)).toBeGreaterThan(0.15)
})
