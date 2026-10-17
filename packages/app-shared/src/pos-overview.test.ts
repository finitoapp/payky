import { describe, expect, test } from "vitest"
import {
  elapsedSeverity,
  matchesTableFilter,
  sumBillRows,
} from "./pos-overview.ts"

describe("elapsedSeverity", () => {
  test("flags a bill open for 2 h as long and 12 h as very long", () => {
    expect(elapsedSeverity(119 * 60_000)).toBe("normal")
    expect(elapsedSeverity(120 * 60_000)).toBe("long")
    expect(elapsedSeverity(12 * 60 * 60_000)).toBe("veryLong")
  })
})

describe("matchesTableFilter", () => {
  test("filters tiles by occupancy", () => {
    expect(matchesTableFilter("all", true)).toBe(true)
    expect(matchesTableFilter("occupied", true)).toBe(true)
    expect(matchesTableFilter("occupied", false)).toBe(false)
    expect(matchesTableFilter("free", false)).toBe(true)
    expect(matchesTableFilter("free", true)).toBe(false)
  })
})

describe("sumBillRows", () => {
  test("has no sum without rows", () => {
    expect(sumBillRows([])).toBeUndefined()
  })
})
