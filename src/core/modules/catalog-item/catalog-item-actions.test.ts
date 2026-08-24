import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import {
  catalogItemByIdQuery,
  catalogItemsQuery,
} from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  createCatalogItem,
  createCatalogItemAtEnd,
  deleteCatalogItem,
  updateCatalogItem,
} from "./catalog-item-actions.ts"

describe("catalog item actions", () => {
  test("creates and updates a catalog item through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createCatalogItem({
        deviceId: null,
        name: NonEmptyString255("Coffee"),
        description: NonEmptyString255("Double espresso"),
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        sortOrder: NonNegativeInteger(10),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Coffee",
          description: "Double espresso",
          currency: "CZK",
          unitAmount: 5900,
          sortOrder: 10,
        },
      ])

    expect(
      await run.ok(
        updateCatalogItem({
          id,
          name: NonEmptyString255("Espresso"),
          description: null,
          currency: undefined,
          unitAmount: NonNegativeInteger(6900),
          sortOrder: undefined,
        })
      )
    ).toBe(id)

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Espresso",
          description: null,
          currency: "CZK",
          unitAmount: 6900,
          sortOrder: 10,
        },
      ])
  }, 15_000)

  test("appends catalog items with an increasing sortOrder", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const firstId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
      })
    )
    const secondId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        name: NonEmptyString255("Tea"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(4900),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemsQuery))
      .toMatchObject([
        { id: firstId, sortOrder: 0 },
        { id: secondId, sortOrder: 1 },
      ])
  }, 15_000)

  test("soft-deletes a catalog item and hides it from queries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createCatalogItem({
        deviceId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        sortOrder: NonNegativeInteger(0),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemsQuery))
      .toMatchObject([{ id }])

    expect(await run.ok(deleteCatalogItem(id))).toBe(id)

    await expect.poll(() => evolu.loadQuery(catalogItemsQuery)).toEqual([])
  }, 15_000)
})
