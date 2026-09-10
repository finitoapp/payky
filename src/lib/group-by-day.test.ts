import { describe, expect, test } from "vitest"

import { groupByDay } from "./group-by-day.ts"

const at = (iso: string) => ({ createdAt: new Date(iso) })
const groupSizes = (items: ReadonlyArray<{ readonly createdAt: Date }>) =>
  groupByDay(items, (item) => item.createdAt).map((group) => group.items.length)

describe("groupByDay", () => {
  test("chunks consecutive items sharing a calendar day", () => {
    expect(
      groupSizes([
        at("2026-09-08T23:30:00"),
        at("2026-09-08T01:00:00"),
        at("2026-09-07T22:00:00"),
      ])
    ).toEqual([2, 1])
  })

  test("splits items an hour apart across midnight", () => {
    expect(
      groupSizes([at("2026-09-08T00:30:00"), at("2026-09-07T23:30:00")])
    ).toEqual([1, 1])
  })

  test("does not merge same-day items that are not adjacent", () => {
    expect(
      groupSizes([
        at("2026-09-08T10:00:00"),
        at("2026-09-07T10:00:00"),
        at("2026-09-08T09:00:00"),
      ])
    ).toEqual([1, 1, 1])
  })
})
