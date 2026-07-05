import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { createOrReuseItemSnapshot } from "@/core/modules/item/item-actions.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import type { BillLineRow } from "./bill-line.ts"
import {
  appendBillLine,
  appendBillLines,
  loadCalculatedBillLineSummaries,
} from "./bill-line-actions.ts"

const coffeeSnapshot = (): ItemRow =>
  createStandaloneItemSnapshot({
    catalogItemId: null,
    name: "Coffee",
    description: null,
    currency: "CZK",
    unitAmount: 5900,
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
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    await expect(run.orThrow(appendBillLines([]))).resolves.toEqual([])
    await expect(
      run.orThrow(appendBillLines([], "bill-1" as BillId))
    ).resolves.toEqual([])
  }, 15_000)

  test("persists a line and returns the bill's calculated summaries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const item = coffeeSnapshot()
    await run.orThrow(createOrReuseItemSnapshot(item))

    const summaries = await run.orThrow(
      appendBillLine(
        coffeeLine(billId, item, { quantity: 2, totalAmount: 11_800 })
      )
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
      run.orThrow(loadCalculatedBillLineSummaries(billId))
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
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const item = coffeeSnapshot()
    await run.orThrow(createOrReuseItemSnapshot(item))

    await run.orThrow(
      appendBillLine(
        coffeeLine(billId, item, { quantity: 2, totalAmount: 11_800 })
      )
    )
    const summaries = await run.orThrow(
      appendBillLine(
        coffeeLine(billId, item, {
          kind: "remove",
          quantity: 1,
          totalAmount: 5900,
        })
      )
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
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const sourceBillId = "bill-source" as BillId
    const targetBillId = "bill-target" as BillId
    const item = coffeeSnapshot()
    await run.orThrow(createOrReuseItemSnapshot(item))

    const summaries = await run.orThrow(
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
      run.orThrow(loadCalculatedBillLineSummaries(sourceBillId))
    ).resolves.toEqual([])
  }, 15_000)
})
