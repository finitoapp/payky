import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { catalogItemByIdQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import { createCatalogItem, updateCatalogItem } from "./catalog-item-actions.ts"

describe("catalog item actions", () => {
  test("creates and updates a catalog item through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const id = await run.orThrow(
      createCatalogItem({
        deviceId: null,
        name: "Coffee",
        description: "Double espresso",
        currency: "CZK",
        unitAmount: 5900,
        sortOrder: 10,
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
      await run.orThrow(
        updateCatalogItem({
          id,
          name: "Espresso",
          description: null,
          currency: undefined,
          unitAmount: 6900,
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
})
