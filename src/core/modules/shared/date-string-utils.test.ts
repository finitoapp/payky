import { addDays } from "date-fns"
import { describe, expect, test } from "vitest"

import { DateStringSchema } from "@/core/modules/shared/schema.ts"
import { dateStringToDate, dateToDateString } from "./date-string-utils.ts"

describe("dateToDateString", () => {
  test("names the local calendar day, not the UTC one", () => {
    // Late evening local time is already the next day in UTC east of it and
    // still the same day west of it; the local day is what counts.
    expect(dateToDateString(new Date(2026, 0, 1, 23, 30))).toBe("2026-01-01")
    expect(dateToDateString(new Date(2026, 0, 2, 0, 15))).toBe("2026-01-02")
  })
})

describe("dateStringToDate", () => {
  test("lands on local midnight of that day", () => {
    const date = dateStringToDate(DateStringSchema.decode("2026-03-29"))

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(29)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })
})

describe("dateToDateString and dateStringToDate", () => {
  test("round-trip every day of a year, daylight-saving switches included", () => {
    const start = new Date(2026, 0, 1)
    const mismatched = Array.from({ length: 366 }, (_, index) =>
      dateToDateString(addDays(start, index))
    ).filter((stored) => dateToDateString(dateStringToDate(stored)) !== stored)

    expect(mismatched).toEqual([])
  })
})
