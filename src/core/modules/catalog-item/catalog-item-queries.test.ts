import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import {
  catalogItemsPageQuery,
  catalogItemUsedCategoryIdsQuery,
} from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import { createCatalogItemAtEnd } from "./catalog-item-actions.ts"

describe("catalogItemsPageQuery", () => {
  test("filters by search text in SQL, ignoring case and diacritics", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const beerId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Pívo Ležák"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(4900),
        scanCode: null,
      })
    )
    await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        scanCode: null,
      })
    )

    await expect
      .poll(() =>
        evolu.loadQuery(
          catalogItemsPageQuery({
            search: "PIVO",
            categoryFilter: "all",
            limit: 10,
          })
        )
      )
      .toMatchObject([{ id: beerId }])

    await expect
      .poll(() =>
        evolu.loadQuery(
          catalogItemsPageQuery({
            search: "žák",
            categoryFilter: "all",
            limit: 10,
          })
        )
      )
      .toMatchObject([{ id: beerId }])
  }, 15_000)

  test("filters by category in SQL", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const uncategorizedId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Loose item"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(1900),
        scanCode: null,
      })
    )

    await expect
      .poll(() =>
        evolu.loadQuery(
          catalogItemsPageQuery({
            search: "",
            categoryFilter: "uncategorized",
            limit: 10,
          })
        )
      )
      .toMatchObject([{ id: uncategorizedId }])

    await expect
      .poll(() =>
        evolu.loadQuery(
          catalogItemsPageQuery({
            search: "",
            categoryFilter: "all",
            limit: 10,
          })
        )
      )
      .toMatchObject([{ id: uncategorizedId }])
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
        createCatalogItemAtEnd({
          deviceId: null,
          categoryId: null,
          name: NonEmptyString255(`Item ${index}`),
          description: null,
          currency: "CZK",
          unitAmount: NonNegativeInteger(1000),
          scanCode: null,
        })
      )
    }

    await expect
      .poll(
        async () =>
          (
            await evolu.loadQuery(
              catalogItemsPageQuery({
                search: "",
                categoryFilter: "all",
                limit: 3,
              })
            )
          ).length
      )
      .toBe(3)

    await expect
      .poll(
        async () =>
          (
            await evolu.loadQuery(
              catalogItemsPageQuery({
                search: "",
                categoryFilter: "all",
                limit: 100,
              })
            )
          ).length
      )
      .toBe(5)
  }, 15_000)
})

describe("catalogItemUsedCategoryIdsQuery", () => {
  test("returns a row for uncategorized items", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    await expect
      .poll(() => evolu.loadQuery(catalogItemUsedCategoryIdsQuery))
      .toEqual([])

    await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        scanCode: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemUsedCategoryIdsQuery))
      .toMatchObject([{ categoryId: null }])
  }, 15_000)
})
