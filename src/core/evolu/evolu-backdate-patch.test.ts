import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "@/test/evolu.ts"

/**
 * `patches/@evolu%2Fcommon@*.patch` adds `evolu.setMutationBackdate`, which the
 * demo-data generator stamps its history with (docs/decisions/demo-data/0001).
 * An Evolu upgrade that drops the patch fails here first.
 */
describe("evolu backdate patch", () => {
  test("stamps createdAt in the past, also jumping back, and leaves later writes on the real clock", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const past = Date.parse("2026-01-15T12:00:00.000Z")
    const insertTable = (name: string) =>
      runMutationWithCompletion(
        (options) =>
          evolu.insert(
            "table",
            {
              name: NonEmptyString255(name),
              code: NonEmptyString255(name),
              seatCount: PositiveInteger(4),
              sortOrder: NonNegativeInteger(0),
            },
            options
          ).id
      )

    evolu.setMutationBackdate(past)
    const first = await insertTable("A")
    // The same millis again stays unique: a duplicate timestamp would be
    // dropped as already applied.
    const second = await insertTable("B")
    // Back to an earlier, unwritten day, as the generator does day by day.
    evolu.setMutationBackdate(past - 24 * 3_600_000)
    const earlier = await insertTable("B2")
    evolu.setMutationBackdate(null)
    const now = await insertTable("C")

    const rows = await evolu.loadQuery(
      createQuery((db) =>
        db.selectFrom("table").select(["id", "createdAt"]).orderBy("name")
      )
    )

    expect(rows.map((row) => row.id)).toEqual([first, second, earlier, now])
    expect(rows[0]?.createdAt).toBe("2026-01-15T12:00:00.000Z")
    expect(rows[1]?.createdAt).toBe("2026-01-15T12:00:00.000Z")
    expect(rows[2]?.createdAt).toBe("2026-01-14T12:00:00.000Z")
    expect(Date.parse(rows[3]?.createdAt ?? "")).toBeGreaterThan(
      Date.now() - 60_000
    )
  })
})
