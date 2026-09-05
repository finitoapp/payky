import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import { createTableAtEnd } from "./table-actions.ts"
import { tablesExistQuery, tablesPageQuery } from "./table-queries.ts"

describe("tablesPageQuery", () => {
  test("filters by search text in SQL, ignoring case and diacritics", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const terraceId = await run.ok(
      createTableAtEnd({
        deviceId: null,
        name: NonEmptyString255("Terasa"),
        seatCount: PositiveInteger(4),
      })
    )
    await run.ok(
      createTableAtEnd({
        deviceId: null,
        name: NonEmptyString255("Bar"),
        seatCount: PositiveInteger(2),
      })
    )

    await expect
      .poll(() =>
        evolu.loadQuery(tablesPageQuery({ search: "TERASA", limit: 10 }))
      )
      .toMatchObject([{ id: terraceId }])
  }, 15_000)

  test("limits the number of rows returned for pagination", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    for (let index = 0; index < 5; index++) {
      await run.ok(
        createTableAtEnd({
          deviceId: null,
          name: NonEmptyString255(`Table ${index}`),
          seatCount: PositiveInteger(2),
        })
      )
    }

    await expect
      .poll(
        async () =>
          (await evolu.loadQuery(tablesPageQuery({ search: "", limit: 3 })))
            .length
      )
      .toBe(3)

    await expect
      .poll(
        async () =>
          (await evolu.loadQuery(tablesPageQuery({ search: "", limit: 100 })))
            .length
      )
      .toBe(5)
  }, 15_000)
})

describe("tablesExistQuery", () => {
  test("reports whether any table exists", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    await expect.poll(() => evolu.loadQuery(tablesExistQuery)).toEqual([])

    await run.ok(
      createTableAtEnd({
        deviceId: null,
        name: NonEmptyString255("Bar"),
        seatCount: PositiveInteger(2),
      })
    )

    await expect
      .poll(async () => (await evolu.loadQuery(tablesExistQuery)).length)
      .toBe(1)
  }, 15_000)
})
