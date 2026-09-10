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
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: NonEmptyString255("Double espresso"),
        internalName: NonEmptyString255("COF-01"),
        internalDescription: NonEmptyString255("Uses the cheap beans"),
        sku: NonEmptyString255("SKU-001"),
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        sortOrder: NonNegativeInteger(10),
        scanCode: null,
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
          internalName: "COF-01",
          internalDescription: "Uses the cheap beans",
          sku: "SKU-001",
          currency: "CZK",
          unitAmount: 5900,
          sortOrder: 10,
          scanCode: null,
        },
      ])

    expect(
      await run.ok(
        updateCatalogItem({
          id,
          name: NonEmptyString255("Espresso"),
          description: null,
          internalName: null,
          internalDescription: null,
          sku: null,
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
          internalName: null,
          internalDescription: null,
          sku: null,
          currency: "CZK",
          unitAmount: 6900,
          sortOrder: 10,
          scanCode: null,
        },
      ])
  }, 15_000)

  test("persists and clears a scan code", async () => {
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
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        sortOrder: NonNegativeInteger(0),
        scanCode: NonEmptyString255("8594001234567"),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(id)))
      .toMatchObject([{ id, scanCode: "8594001234567" }])

    await run.ok(
      updateCatalogItem({
        id,
        scanCode: NonEmptyString255("8594007654321"),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(id)))
      .toMatchObject([{ id, scanCode: "8594007654321" }])

    await run.ok(updateCatalogItem({ id, scanCode: null }))

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(id)))
      .toMatchObject([{ id, scanCode: null }])
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
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        scanCode: null,
      })
    )
    const secondId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Tea"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(4900),
        scanCode: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemsQuery))
      .toMatchObject([
        { id: firstId, sortOrder: 0 },
        { id: secondId, sortOrder: 1 },
      ])
  }, 15_000)

  test("appends past a two-digit sortOrder", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    // 10 after 9, the pair a lexical comparison gets backwards ("9" > "10"),
    // which would append the next item at 10 — on top of an item already
    // there. `sortOrder` lives in an `any` column, so its storage type does
    // not settle which comparison SQLite applies; the tests above stop at
    // single digits, where the two agree.
    for (const [name, sortOrder] of [
      ["Ninth", 9],
      ["Tenth", 10],
    ] as const) {
      await run.ok(
        createCatalogItem({
          deviceId: null,
          categoryId: null,
          name: NonEmptyString255(name),
          description: null,
          currency: "CZK",
          unitAmount: NonNegativeInteger(5900),
          sortOrder: NonNegativeInteger(sortOrder),
          scanCode: null,
        })
      )
    }

    const appendedId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Eleventh"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(4900),
        scanCode: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemByIdQuery(appendedId)))
      .toMatchObject([{ id: appendedId, sortOrder: 11 }])
  }, 15_000)

  test("appends over a deleted item's sortOrder", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    // Deleting the last item frees its `sortOrder` for the next one, because
    // the highest value is read over non-deleted items only. Harmless — order
    // is presentational here, unlike a bill's `displayNumber` — but it is the
    // behaviour, and it is what says the predicates behind the highest-value
    // lookup still match the listing's.
    const firstId = await run.ok(
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
    const deletedId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Tea"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(4900),
        scanCode: null,
      })
    )
    await run.ok(deleteCatalogItem(deletedId))

    const appendedId = await run.ok(
      createCatalogItemAtEnd({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Cocoa"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(3900),
        scanCode: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemsQuery))
      .toMatchObject([
        { id: firstId, sortOrder: 0 },
        { id: appendedId, sortOrder: 1 },
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
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: null,
        currency: "CZK",
        unitAmount: NonNegativeInteger(5900),
        sortOrder: NonNegativeInteger(0),
        scanCode: null,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(catalogItemsQuery))
      .toMatchObject([{ id }])

    expect(await run.ok(deleteCatalogItem(id))).toBe(id)

    await expect.poll(() => evolu.loadQuery(catalogItemsQuery)).toEqual([])
  }, 15_000)
})
