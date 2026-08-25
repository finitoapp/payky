import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { loadCalculatedBillLineSummaries } from "@/core/modules/bill-line/bill-line-actions.ts"
import { createCatalogItem } from "@/core/modules/catalog-item/catalog-item-actions.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  addCatalogItemToBill,
  addManualAmountToBill,
  addTipToBill,
  appendRemoveBillLine,
  assignBillToTable,
  cancelBill,
  closeBillAsPaid,
  createBill,
  createBillAtEnd,
  listOpenBills,
  loadBill,
  partiallyPayBill,
  removeTableFromBill,
  splitBill,
} from "./bill-actions.ts"
import { billByIdQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const billLinesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("billLine")
      .selectAll()
      .where("billId", "=", billId)
      .orderBy("createdAt", "asc")
  )

const createOpenBill = async (
  deps: EvoluDep & EvoluOwnerIdDep,
  input?: {
    readonly displayNumber?: number
    readonly label?: string | null
  }
): Promise<BillId> => {
  await using run = testCreateRun(deps)
  const id = await run.ok(
    createBill({
      deviceId: null,
      displayNumber: PositiveInteger(input?.displayNumber ?? 1),
      label: input?.label != null ? NonEmptyString255(input.label) : null,
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
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(42),
        label: NonEmptyString255("Dinner"),
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

    await run.ok(assignBillToTable({ id, tableId: "table-1" as TableId }))
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(id)))
      .toMatchObject([
        {
          id,
          tableId: "table-1",
        },
      ])

    await run.ok(removeTableFromBill(id))
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

  test("appends bills with an increasing displayNumber, skipping closed ones", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const firstId = await run.ok(
      createBillAtEnd({
        deviceId: null,
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(cancelBill(firstId))
    const secondId = await run.ok(
      createBillAtEnd({
        deviceId: null,
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )

    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(firstId)))
      .toMatchObject([{ id: firstId, displayNumber: 1 }])
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(secondId)))
      .toMatchObject([{ id: secondId, displayNumber: 2 }])
  }, 15_000)

  test("lists only open and partially paid bills with calculated items", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
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
        name: NonEmptyString255("Service"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
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
      .poll(() => run.ok(listOpenBills()))
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

  test("adds catalog, manual amount, and tip lines to a bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)
    const catalogItemId = await run.ok(
      createCatalogItem({
        deviceId: null,
        name: NonEmptyString255("Coffee"),
        description: NonEmptyString255("Double espresso"),
        currency: "CZK",
        unitAmount: NonNegativeInteger(5_900),
        sortOrder: NonNegativeInteger(10),
      })
    )

    const catalogLineSummary = await run.orThrow(
      addCatalogItemToBill({
        billId,
        deviceId: null,
        catalogItemId,
        quantity: PositiveNumber(2),
      })
    )
    const manualLineSummary = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Custom discount correction"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_500),
      })
    )
    const tipLineSummary = await run.orThrow(
      addTipToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Tip"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(2_000),
      })
    )

    expect(catalogLineSummary).toMatchObject({
      billId,
      catalogItemId,
      type: "catalogItem",
      name: "Coffee",
      description: "Double espresso",
      quantity: 2,
      totalAmount: 11_800,
    })
    expect(manualLineSummary).toMatchObject({
      billId,
      catalogItemId: null,
      type: "manualAmount",
      name: "Custom discount correction",
      quantity: 1,
      totalAmount: 1_500,
    })
    expect(tipLineSummary).toMatchObject({
      billId,
      catalogItemId: null,
      type: "tip",
      name: "Tip",
      quantity: 1,
      totalAmount: 2_000,
    })

    await expect
      .poll(() => run.ok(loadCalculatedBillLineSummaries(billId)))
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
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)

    await expect(
      run(
        addCatalogItemToBill({
          billId,
          deviceId: null,
          catalogItemId: "catalog-item-1" as CatalogItemId,
          quantity: PositiveNumber(1),
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      error: {
        id: "catalog-item-1",
      },
    })
  }, 15_000)

  test("appends a remove line and removes depleted bill line summaries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)
    const lineSummary = await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Manual charge"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(5_000),
      })
    )

    const afterPartialRemove = await run.orThrow(
      appendRemoveBillLine({
        billId,
        deviceId: null,
        lineSummary,
        quantity: PositiveNumber(0.25),
        totalAmount: NonNegativeInteger(1_250),
      })
    )

    expect(afterPartialRemove).toMatchObject({
      id: lineSummary.id,
      quantity: 0.75,
      totalAmount: 3_750,
    })
    expect(afterPartialRemove).not.toBeNull()
    if (afterPartialRemove === null) return

    const afterFullRemove = await run.orThrow(
      appendRemoveBillLine({
        billId,
        deviceId: null,
        lineSummary: afterPartialRemove,
        quantity: PositiveNumber(0.75),
        totalAmount: NonNegativeInteger(3_750),
      })
    )

    expect(afterFullRemove).toBeNull()
    await expect
      .poll(() => run.ok(loadCalculatedBillLineSummaries(billId)))
      .toMatchObject([])
    await expect
      .poll(() => evolu.loadQuery(billLinesByBillIdQuery(billId)))
      .toHaveLength(3)
  }, 15_000)

  test("splits selected items from a source bill into an existing target bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)
    const sourceBillId = await createOpenBill(deps, {
      displayNumber: 1,
      label: "Source",
    })
    const targetBillId = await createOpenBill(deps, {
      displayNumber: 2,
      label: "Target",
    })
    const lineSummary = await run.orThrow(
      addManualAmountToBill({
        billId: sourceBillId,
        deviceId: null,
        name: NonEmptyString255("Shared dish"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(12_000),
      })
    )

    const result = await run.orThrow(
      splitBill({
        sourceBillId,
        targetBillId,
        items: [lineSummary],
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
      .poll(() => run.ok(loadCalculatedBillLineSummaries(sourceBillId)))
      .toMatchObject([])
    await expect
      .poll(() => run.ok(loadCalculatedBillLineSummaries(targetBillId)))
      .toMatchObject([
        {
          billId: targetBillId,
          name: "Shared dish",
        },
      ])
  }, 15_000)

  test("returns an error when splitting into a missing target bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
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

  test("rejects adding or removing lines on a canceled or paid bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const canceledBillId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(cancelBill(canceledBillId))
    const paidBillId = await createOpenBill(deps, { displayNumber: 2 })
    await run.orThrow(closeBillAsPaid(paidBillId))

    for (const billId of [canceledBillId, paidBillId]) {
      await expect(
        run(
          addManualAmountToBill({
            billId,
            deviceId: null,
            name: NonEmptyString255("Late addition"),
            currency: "CZK",
            totalAmount: NonNegativeInteger(500),
          })
        )
      ).resolves.toMatchObject({ ok: false, error: { type: "BillNotOpen" } })
    }
  }, 15_000)

  test("rejects canceling a paid bill but allows re-canceling a canceled one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const paidBillId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(closeBillAsPaid(paidBillId))

    await expect(run(cancelBill(paidBillId))).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "paid" },
    })

    const canceledBillId = await createOpenBill(deps, { displayNumber: 2 })
    await run.orThrow(cancelBill(canceledBillId))
    await expect(run.orThrow(cancelBill(canceledBillId))).resolves.toBe(
      canceledBillId
    )
  }, 15_000)

  test("rejects closing a canceled bill as paid but allows re-closing a paid one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const canceledBillId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(cancelBill(canceledBillId))

    await expect(run(closeBillAsPaid(canceledBillId))).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "canceled" },
    })

    const paidBillId = await createOpenBill(deps, { displayNumber: 2 })
    await run.orThrow(closeBillAsPaid(paidBillId))
    await expect(run.orThrow(closeBillAsPaid(paidBillId))).resolves.toBe(
      paidBillId
    )
  }, 15_000)
})
