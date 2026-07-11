import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import type { ItemRow } from "./item.ts"
import {
  createOrReuseCatalogItemSnapshot,
  createOrReuseItemSnapshot,
} from "./item-actions.ts"
import {
  createCatalogItemSnapshot,
  createStandaloneItemSnapshot,
} from "./item-utils.ts"

const allItemsQuery = createQuery((db) => db.selectFrom("item").selectAll())

const itemByIdQuery = (id: ItemRow["id"]) =>
  createQuery((db) => db.selectFrom("item").selectAll().where("id", "=", id))

const coffeeSnapshot = (): ItemRow =>
  createStandaloneItemSnapshot({
    catalogItemId: null,
    name: "Coffee",
    description: null,
    currency: "CZK",
    unitAmount: 5900,
  } as Omit<ItemRow, "id">)

describe("item actions", () => {
  test("persists the snapshot and returns it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const snapshot = coffeeSnapshot()
    const returned = await run.orThrow(createOrReuseItemSnapshot(snapshot))

    expect(returned).toEqual(snapshot)
    await expect
      .poll(() => evolu.loadQuery(itemByIdQuery(snapshot.id)))
      .toMatchObject([
        {
          id: snapshot.id,
          catalogItemId: null,
          name: "Coffee",
          currency: "CZK",
          unitAmount: 5900,
        },
      ])
  }, 15_000)

  test("reuses the same row for an identical snapshot", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const snapshot = coffeeSnapshot()
    await run.orThrow(createOrReuseItemSnapshot(snapshot))
    await run.orThrow(createOrReuseItemSnapshot(snapshot))

    await expect
      .poll(async () => (await evolu.loadQuery(allItemsQuery)).length)
      .toBe(1)
  }, 15_000)

  test("derives a stable item snapshot from a catalog item", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const catalogItem = {
      id: "catalog-1",
      deviceId: null,
      name: "Tea",
      description: "Green",
      currency: "CZK",
      unitAmount: 4200,
      sortOrder: 0,
    } as CatalogItemRow

    const returned = await run.orThrow(
      createOrReuseCatalogItemSnapshot(catalogItem)
    )

    expect(returned).toEqual(createCatalogItemSnapshot(catalogItem))
    expect(returned.catalogItemId).toBe(catalogItem.id)
    await expect
      .poll(() => evolu.loadQuery(itemByIdQuery(returned.id)))
      .toMatchObject([
        {
          id: returned.id,
          catalogItemId: "catalog-1",
          name: "Tea",
          description: "Green",
          unitAmount: 4200,
        },
      ])
  }, 15_000)
})
