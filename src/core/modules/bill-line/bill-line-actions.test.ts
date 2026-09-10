import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { createOrReuseItemSnapshot } from "@/core/modules/item/item-actions.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import type { BillLineRow } from "./bill-line.ts"
import {
  appendBillLines,
  loadCalculatedBillLineSummaries,
} from "./bill-line-actions.ts"
import { billLinesByBillIdQuery } from "./bill-line-queries.ts"

const coffeeSnapshot = (): ItemRow =>
  createStandaloneItemSnapshot({
    catalogItemId: null,
    name: "Coffee",
    description: null,
    currency: "CZK",
    unitAmount: 5900,
  } as Omit<ItemRow, "id">)

const teaSnapshot = (): ItemRow =>
  createStandaloneItemSnapshot({
    catalogItemId: null,
    name: "Tea",
    description: null,
    currency: "CZK",
    unitAmount: 4200,
  } as Omit<ItemRow, "id">)

const coffeeLine = (
  billId: BillId,
  item: ItemRow,
  input?: {
    readonly kind?: BillLineRow["kind"]
    readonly quantity?: number
    readonly totalAmount?: number
  }
): Omit<BillLineRow, "id"> =>
  ({
    billId,
    deviceId: null,
    catalogItemId: null,
    itemId: item.id,
    type: "catalogItem",
    kind: input?.kind ?? "add",
    quantity: input?.quantity ?? 1,
    totalAmount: input?.totalAmount ?? 5900,
  }) as Omit<BillLineRow, "id">

describe("bill line actions", () => {
  test("returns no summaries when appending no lines", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    await expect(run.ok(appendBillLines([]))).resolves.toEqual([])
    await expect(
      run.ok(appendBillLines([], "bill-1" as BillId))
    ).resolves.toEqual([])
  }, 15_000)

  test("persists a line and returns the bill's calculated summaries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const item = coffeeSnapshot()
    await run.ok(createOrReuseItemSnapshot(item))

    const summaries = await run.ok(
      appendBillLines([
        coffeeLine(billId, item, { quantity: 2, totalAmount: 11_800 }),
      ])
    )

    expect(summaries).toMatchObject([
      {
        billId,
        itemId: item.id,
        type: "catalogItem",
        name: "Coffee",
        quantity: 2,
        totalAmount: 11_800,
      },
    ])
    await expect(
      run.ok(loadCalculatedBillLineSummaries(billId))
    ).resolves.toMatchObject([
      {
        billId,
        itemId: item.id,
        quantity: 2,
        totalAmount: 11_800,
      },
    ])
  }, 15_000)

  test("projects add and remove lines to a net summary", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const item = coffeeSnapshot()
    await run.ok(createOrReuseItemSnapshot(item))

    await run.ok(
      appendBillLines([
        coffeeLine(billId, item, { quantity: 2, totalAmount: 11_800 }),
      ])
    )
    const summaries = await run.ok(
      appendBillLines([
        coffeeLine(billId, item, {
          kind: "remove",
          quantity: 1,
          totalAmount: 5900,
        }),
      ])
    )

    expect(summaries).toMatchObject([
      {
        billId,
        itemId: item.id,
        quantity: 1,
        totalAmount: 5900,
      },
    ])
  }, 15_000)

  test("returns the requested bill's summaries when lines span bills", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const sourceBillId = "bill-source" as BillId
    const targetBillId = "bill-target" as BillId
    const item = coffeeSnapshot()
    await run.ok(createOrReuseItemSnapshot(item))

    const summaries = await run.ok(
      appendBillLines(
        [
          coffeeLine(sourceBillId, item, { kind: "remove" }),
          coffeeLine(targetBillId, item),
        ],
        targetBillId
      )
    )

    expect(summaries).toMatchObject([
      {
        billId: targetBillId,
        itemId: item.id,
        quantity: 1,
        totalAmount: 5900,
      },
    ])
    await expect(
      run.ok(loadCalculatedBillLineSummaries(sourceBillId))
    ).resolves.toEqual([])
  }, 15_000)

  test("orders lines written in one batch by id, not arbitrarily", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const coffee = coffeeSnapshot()
    await run.ok(createOrReuseItemSnapshot(coffee))

    // Lines written in one batch normally share a `createdAt`, leaving their
    // relative order to SQLite — and that order decides what the bill totals,
    // since `calculateBillLineSummaries` folds add/remove sequentially and
    // drops a summary the moment its running quantity hits zero. This pins
    // the ordering `billLinesByBillIdQuery` now states explicitly (see its
    // doc comment for why the shape is what it is).
    await run.ok(
      appendBillLines([
        coffeeLine(billId, coffee),
        coffeeLine(billId, coffee, { kind: "remove" }),
        coffeeLine(billId, coffee),
        coffeeLine(billId, coffee, { kind: "remove" }),
      ])
    )

    // Asserted against the full `(createdAt, ownerId, id)` key rather than
    // against ascending ids alone: a batch can straddle a millisecond, and
    // then ids only ascend *within* each `createdAt` group. Keying the
    // expectation on the same composite the query orders by holds either way
    // and still fails if the tie-break is dropped.
    const lineRows = await evolu.loadQuery(billLinesByBillIdQuery(billId))
    const orderKey = (row: (typeof lineRows)[number]) =>
      `${row.createdAt}\u0000${row.ownerId}\u0000${row.id}`

    expect(lineRows).toHaveLength(4)
    expect(lineRows.map(orderKey)).toEqual([...lineRows].map(orderKey).sort())
  }, 15_000)

  test("resolves each bill's own item snapshots, including one shared by both", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const coffeeBillId = "bill-coffee" as BillId
    const teaBillId = "bill-tea" as BillId
    const coffee = coffeeSnapshot()
    const tea = teaSnapshot()
    await run.ok(createOrReuseItemSnapshot(coffee))
    await run.ok(createOrReuseItemSnapshot(tea))

    // `coffee` is on both bills — content-addressed `item` ids mean one
    // snapshot row is normally shared across every bill selling it, so the
    // per-bill load must resolve it for each of them, not just the first.
    await run.ok(
      appendBillLines([
        coffeeLine(coffeeBillId, coffee),
        coffeeLine(teaBillId, coffee),
        coffeeLine(teaBillId, tea, { totalAmount: 4200 }),
      ])
    )

    await expect(
      run.ok(loadCalculatedBillLineSummaries(coffeeBillId))
    ).resolves.toMatchObject([
      { billId: coffeeBillId, itemId: coffee.id, name: "Coffee" },
    ])
    // Sorted, not positional: every line in the batch above shares one
    // `createdAt`, so `billLinesByBillIdQuery`'s `orderBy createdAt` leaves
    // the order among them unspecified.
    const teaBillSummaries = await run.ok(
      loadCalculatedBillLineSummaries(teaBillId)
    )
    expect(teaBillSummaries.map((summary) => summary.name).sort()).toEqual([
      "Coffee",
      "Tea",
    ])
    expect(
      teaBillSummaries.every((summary) => summary.billId === teaBillId)
    ).toBe(true)
  }, 15_000)

  test("drops a line whose item snapshot has not arrived yet", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const coffee = coffeeSnapshot()
    const unsynced = teaSnapshot()
    // Only `coffee`'s snapshot is written: under multi-device sync a
    // `billLine` can arrive before the `item` row it points at.
    await run.ok(createOrReuseItemSnapshot(coffee))

    await expect(
      run.ok(
        appendBillLines([
          coffeeLine(billId, coffee),
          coffeeLine(billId, unsynced, { totalAmount: 4200 }),
        ])
      )
    ).resolves.toMatchObject([{ billId, itemId: coffee.id, name: "Coffee" }])
  }, 15_000)
})
