import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import {
  catalogCategoriesExistQuery,
  catalogCategoriesPageQuery,
} from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import { createCatalogCategoryAtEnd } from "./catalog-category-actions.ts"

describe("catalogCategoriesPageQuery", () => {
  test("filters by search text in SQL, ignoring case and diacritics", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
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
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
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
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
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
