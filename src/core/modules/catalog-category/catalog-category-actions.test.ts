import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import {
  catalogCategoriesQuery,
  catalogCategoryByIdQuery,
} from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  createCatalogCategory,
  createCatalogCategoryAtEnd,
  deleteCatalogCategory,
  updateCatalogCategory,
} from "./catalog-category-actions.ts"

describe("catalog category actions", () => {
  test("creates and updates a catalog category through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createCatalogCategory({
        deviceId: null,
        name: NonEmptyString255("Drinks"),
        sortOrder: NonNegativeInteger(10),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogCategoryByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Drinks",
          sortOrder: 10,
        },
      ])

    expect(
      await run.ok(
        updateCatalogCategory({
          id,
          name: NonEmptyString255("Beverages"),
          sortOrder: undefined,
        })
      )
    ).toBe(id)

    await expect
      .poll(() => evolu.loadQuery(catalogCategoryByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Beverages",
          sortOrder: 10,
        },
      ])
  }, 15_000)

  test("appends catalog categories with an increasing sortOrder", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const firstId = await run.ok(
      createCatalogCategoryAtEnd({
        deviceId: null,
        name: NonEmptyString255("Drinks"),
      })
    )
    const secondId = await run.ok(
      createCatalogCategoryAtEnd({
        deviceId: null,
        name: NonEmptyString255("Food"),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogCategoriesQuery))
      .toMatchObject([
        { id: firstId, sortOrder: 0 },
        { id: secondId, sortOrder: 1 },
      ])
  }, 15_000)

  test("soft-deletes a catalog category and hides it from queries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createCatalogCategory({
        deviceId: null,
        name: NonEmptyString255("Drinks"),
        sortOrder: NonNegativeInteger(0),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogCategoriesQuery))
      .toMatchObject([{ id }])

    expect(await run.ok(deleteCatalogCategory(id))).toBe(id)

    await expect.poll(() => evolu.loadQuery(catalogCategoriesQuery)).toEqual([])
  }, 15_000)
})
