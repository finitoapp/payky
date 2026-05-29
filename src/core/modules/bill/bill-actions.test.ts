import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import { createCatalogItem } from "@/core/modules/catalog-item/catalog-item-actions.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  addCatalogItemToBill,
  addManualAmountToBill,
  addTipToBill,
  appendRemoveBillItemLine,
  assignBillToTable,
  cancelBill,
  closeBillAsPaid,
  createBill,
  listOpenBills,
  loadBill,
  partiallyPayBill,
  removeTableFromBill,
  splitBill,
} from "./bill-actions.ts"
import { billByIdQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

const billItemsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billItem")
      .selectAll()
      .where("billId", "=", billId)
      .orderBy("name", "asc")
  )

const billItemLinesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billItemLine")
      .selectAll()
      .where("billId", "=", billId)
      .orderBy("createdAt", "asc")
  )

const createOpenBill = async (
  deps: EvoluDep,
  input?: {
    readonly displayNumber?: number
    readonly label?: string | null
  }
): Promise<BillId> => {
  await using run = testCreateRun(deps)
  const id = await run.orThrow(
    createBill({
      deviceId: null,
      displayNumber: input?.displayNumber ?? 1,
      label: input?.label ?? null,
      tableId: null,
      currency: "CZK",
    })
  )
  return id
}

describe("bill actions", () => {
  test("creates, loads, assigns, unassigns, and closes a bill through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const id = await run.orThrow(
      createBill({
        deviceId: null,
        displayNumber: 42,
        label: "Dinner",
        tableId: null,
        currency: "CZK",
      })
    )

    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          displayNumber: 42,
          label: "Dinner",
          tableId: null,
          status: "open",
          currency: "CZK",
        },
      ])

    await expect(run(loadBill(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        displayNumber: 42,
        status: "open",
        currency: "CZK",
      },
    })

    await run.orThrow(assignBillToTable({ id, tableId: "table-1" }))
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          tableId: "table-1",
        },
      ])

    await run.orThrow(removeTableFromBill(id))
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          tableId: null,
        },
      ])

    await run.orThrow(
      partiallyPayBill({
        id,
        paymentId: "payment-1" as PaymentId,
      })
    )
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          status: "partiallyPaid",
        },
      ])

    await run.orThrow(closeBillAsPaid(id))
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          status: "paid",
          closedAt: expect.any(Number),
        },
      ])
  }, 15_000)

  test("lists only open and partially paid bills with calculated items", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const openId = await createOpenBill(deps, {
      displayNumber: 1,
      label: "Open",
    })
    const partiallyPaidId = await createOpenBill(deps, {
      displayNumber: 2,
      label: "Partially paid",
    })
    const canceledId = await createOpenBill(deps, {
      displayNumber: 3,
      label: "Canceled",
    })

    await run.orThrow(
      addManualAmountToBill({
        billId: openId,
        deviceId: null,
        name: "Service",
        currency: "CZK",
        totalAmount: 1_000,
      })
    )
    await run.orThrow(
      partiallyPayBill({
        id: partiallyPaidId,
        paymentId: "payment-1" as PaymentId,
      })
    )
    await run.orThrow(cancelBill(canceledId))

    await expect
      .poll(() => run.orThrow(listOpenBills()))
      .toMatchObject([
        {
          bill: {
            id: openId,
            status: "open",
          },
          items: [
            {
              name: "Service",
              quantity: 1,
              totalAmount: 1_000,
            },
          ],
        },
        {
          bill: {
            id: partiallyPaidId,
            status: "partiallyPaid",
          },
          items: [],
        },
      ])
  }, 15_000)

  test("adds catalog, manual amount, and tip items to a bill projection", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)
    const catalogItemId = await run.orThrow(
      createCatalogItem({
        deviceId: null,
        name: "Coffee",
        description: "Double espresso",
        currency: "CZK",
        unitAmount: 5_900,
        sortOrder: 10,
      })
    )

    const catalogBillItem = await run.orThrow(
      addCatalogItemToBill({
        billId,
        deviceId: null,
        catalogItemId,
        quantity: 2,
      })
    )
    const manualBillItem = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: "Custom discount correction",
        currency: "CZK",
        totalAmount: 1_500,
      })
    )
    const tipBillItem = await run.orThrow(
      addTipToBill({
        billId,
        deviceId: null,
        name: "Tip",
        currency: "CZK",
        totalAmount: 2_000,
      })
    )

    expect(catalogBillItem).toMatchObject({
      billId,
      catalogItemId,
      type: "catalogItem",
      name: "Coffee",
      description: "Double espresso",
      quantity: 2,
      totalAmount: 11_800,
    })
    expect(manualBillItem).toMatchObject({
      billId,
      catalogItemId: null,
      type: "manualAmount",
      name: "Custom discount correction",
      quantity: 1,
      totalAmount: 1_500,
    })
    expect(tipBillItem).toMatchObject({
      billId,
      catalogItemId: null,
      type: "tip",
      name: "Tip",
      quantity: 1,
      totalAmount: 2_000,
    })

    await expect
      .poll(() => evolu.loadQuery(billItemsByBillIdQuery(billId)))
      .toMatchObject([
        {
          name: "Coffee",
          type: "catalogItem",
          quantity: 2,
          totalAmount: 11_800,
        },
        {
          name: "Custom discount correction",
          type: "manualAmount",
          quantity: 1,
          totalAmount: 1_500,
        },
        {
          name: "Tip",
          type: "tip",
          quantity: 1,
          totalAmount: 2_000,
        },
      ])
  }, 15_000)

  test("returns an error when adding a missing catalog item", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)

    await expect(
      run(
        addCatalogItemToBill({
          billId,
          deviceId: null,
          catalogItemId: "catalog-item-1" as CatalogItemId,
          quantity: 1,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        id: "catalog-item-1",
      },
    })
  }, 15_000)

  test("appends a remove line and removes depleted bill item projections", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)
    const billItem = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: "Manual charge",
        currency: "CZK",
        totalAmount: 5_000,
      })
    )

    const afterPartialRemove = await run.orThrow(
      appendRemoveBillItemLine({
        billId,
        deviceId: null,
        billItem,
        quantity: 0.25,
        totalAmount: 1_250,
      })
    )

    expect(afterPartialRemove).toMatchObject({
      id: billItem.id,
      quantity: 0.75,
      totalAmount: 3_750,
    })
    expect(afterPartialRemove).not.toBeNull()
    if (afterPartialRemove == null) return

    const afterFullRemove = await run.orThrow(
      appendRemoveBillItemLine({
        billId,
        deviceId: null,
        billItem: afterPartialRemove,
        quantity: 0.75,
        totalAmount: 3_750,
      })
    )

    expect(afterFullRemove).toBeNull()
    await expect
      .poll(() => evolu.loadQuery(billItemsByBillIdQuery(billId)))
      .toMatchObject([
        {
          id: billItem.id,
          isDeleted: 1,
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(billItemLinesByBillIdQuery(billId)))
      .toHaveLength(3)
  }, 15_000)

  test("splits selected items from a source bill into an existing target bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const sourceBillId = await createOpenBill(deps, {
      displayNumber: 1,
      label: "Source",
    })
    const targetBillId = await createOpenBill(deps, {
      displayNumber: 2,
      label: "Target",
    })
    const billItem = await run.orThrow(
      addManualAmountToBill({
        billId: sourceBillId,
        deviceId: null,
        name: "Shared dish",
        currency: "CZK",
        totalAmount: 12_000,
      })
    )

    const result = await run.orThrow(
      splitBill({
        sourceBillId,
        targetBillId,
        items: [billItem],
      })
    )

    expect(result).toMatchObject({
      bill: {
        id: targetBillId,
        label: "Target",
      },
      items: [
        {
          billId: targetBillId,
          name: "Shared dish",
          quantity: 1,
          totalAmount: 12_000,
        },
      ],
    })
    await expect
      .poll(() => evolu.loadQuery(billItemsByBillIdQuery(sourceBillId)))
      .toMatchObject([
        {
          billId: sourceBillId,
          name: "Shared dish",
          isDeleted: 1,
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(billItemsByBillIdQuery(targetBillId)))
      .toMatchObject([
        {
          billId: targetBillId,
          name: "Shared dish",
          isDeleted: null,
        },
      ])
  }, 15_000)

  test("returns an error when splitting into a missing target bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)
    const sourceBillId = await createOpenBill(deps)

    await expect(
      run(
        splitBill({
          sourceBillId,
          targetBillId: "bill-missing" as BillId,
          items: [],
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        id: "bill-missing",
      },
    })
  }, 15_000)
})
