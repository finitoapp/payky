import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerDep } from "../../deps.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { NonEmptyString255 } from "../shared/schema.ts"
import { createCatalogCategoryAtEnd } from "./catalog-category-actions.ts"
import {
  catalogCategoriesExistQuery,
  catalogCategoriesPageQuery,
} from "./catalog-category-queries.ts"

describe("catalogCategoriesPageQuery", () => {
  test("filters by search text in SQL, ignoring case and diacritics", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
    } satisfies EvoluDep & EvoluOwnerDep
    await using run = testCreateRun(deps)

    const drinksId = await run.ok(
      createCatalogCategoryAtEnd({
        deviceId: null,
        name: NonEmptyString255("Nápoje"),
      })
    )
    await run.ok(
      createCatalogCategoryAtEnd({
        deviceId: null,
        name: NonEmptyString255("Food"),
      })
    )

    await expect
      .poll(() =>
        evolu.loadQuery(
          catalogCategoriesPageQuery({ search: "NAPOJE", limit: 10 })
        )
      )
      .toMatchObject([{ id: drinksId }])
  }, 15_000)

  test("limits the number of rows returned for pagination", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
    } satisfies EvoluDep & EvoluOwnerDep
    await using run = testCreateRun(deps)

    for (let index = 0; index < 5; index++) {
      await run.ok(
        createCatalogCategoryAtEnd({
          deviceId: null,
          name: NonEmptyString255(`Category ${index}`),
        })
      )
    }

    await expect
      .poll(
        async () =>
          (
            await evolu.loadQuery(
              catalogCategoriesPageQuery({ search: "", limit: 3 })
            )
          ).length
      )
      .toBe(3)

    await expect
      .poll(
        async () =>
          (
            await evolu.loadQuery(
              catalogCategoriesPageQuery({ search: "", limit: 100 })
            )
          ).length
      )
      .toBe(5)
  }, 15_000)
})

describe("catalogCategoriesExistQuery", () => {
  test("reports whether any category exists", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
    } satisfies EvoluDep & EvoluOwnerDep
    await using run = testCreateRun(deps)

    await expect
      .poll(() => evolu.loadQuery(catalogCategoriesExistQuery))
      .toEqual([])

    await run.ok(
      createCatalogCategoryAtEnd({
        deviceId: null,
        name: NonEmptyString255("Drinks"),
      })
    )

    await expect
      .poll(
        async () => (await evolu.loadQuery(catalogCategoriesExistQuery)).length
      )
      .toBe(1)
  }, 15_000)
})
