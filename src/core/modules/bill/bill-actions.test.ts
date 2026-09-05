import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import { loadCalculatedBillLineSummaries } from "@/core/modules/bill-line/bill-line-actions.ts"
import { createCatalogItem } from "@/core/modules/catalog-item/catalog-item-actions.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import {
  createPayment,
  markPaymentPaidCash,
} from "@/core/modules/payment/payment-actions.ts"
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
  closeBill,
  confirmBillClosedDespiteCancellation,
  createBill,
  createBillAtEnd,
  listOpenBills,
  loadBill,
  loadBillCoverage,
  loadBillStatus,
  removeTableFromBill,
  splitBill,
} from "./bill-actions.ts"
import { billByIdQuery } from "./bill-queries.ts"
import { type BillId, createRandomBillId } from "./bill-types.ts"

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

/**
 * Adds a manual-amount line for `amount` and confirms a cash payment that
 * covers it, so `billId` becomes derived-`closed` through the ordinary
 * automatic path (a claim covering its total) rather than through
 * `closeBill`, which is now reserved for the manual "closedAt` cache is
 * missing/stale" repair case — see `bill-actions.ts`'s doc comment.
 */
const closeBillWithCashPayment = async (
  deps: EvoluDep & EvoluOwnerIdDep & DateDep,
  billId: BillId,
  amount: number
): Promise<void> => {
  await using run = testCreateRun(deps)
  const accountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Cash register"),
      cashRegister: { currency: "CZK" },
    })
  )
  await run.orThrow(
    addManualAmountToBill({
      billId,
      deviceId: null,
      name: NonEmptyString255("Dinner"),
      currency: "CZK",
      totalAmount: NonNegativeInteger(amount),
    })
  )
  const paymentId = await run.orThrow(
    createPayment({
      deviceId: null,
      billId,
      tableId: null,
      amount: NonNegativeInteger(amount),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
      cashRegister: { accountId },
    })
  )
  await run.orThrow(markPaymentPaidCash({ paymentId, accountId }))
}

describe("bill actions", () => {
  test("creates, loads, assigns, and unassigns a bill through real Evolu", async () => {
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
          currency: "CZK",
        },
      ])

    await expect(run(loadBill(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        displayNumber: 42,
        currency: "CZK",
      },
    })
    await expect(run.orThrow(loadBillStatus(id))).resolves.toBe("open")

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

    const firstId = createRandomBillId()
    await run.ok(
      createBillAtEnd({
        id: firstId,
        deviceId: null,
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )
    await run.orThrow(cancelBill(firstId))
    const secondId = createRandomBillId()
    await run.ok(
      createBillAtEnd({
        id: secondId,
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

  test("lists only open bills with calculated items", async () => {
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
    const closedId = await createOpenBill(deps, {
      displayNumber: 2,
      label: "Closed",
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
    await closeBillWithCashPayment(deps, closedId, 2_000)
    await run.orThrow(cancelBill(canceledId))

    await expect
      .poll(() => run.ok(listOpenBills()))
      .toMatchObject([
        {
          bill: {
            id: openId,
          },
          items: [
            {
              name: "Service",
              quantity: 1,
              totalAmount: 1_000,
            },
          ],
        },
      ])
    await expect(run.orThrow(loadBillStatus(openId))).resolves.toBe("open")
  }, 15_000)

  test("a bill can linger in listOpenBills after it's already closed, if its closedAt cache never got written", async () => {
    // This is the one documented limitation of the `closedAt` cache (see
    // docs/bill-payment-states.md's "`closedAt` is a cache, not a status"):
    // `openBillsQuery`/`listOpenBills` filter on the cache for cheapness,
    // not on live coverage, so a bill whose cache write never landed (the
    // multi-device race described there) can still show up as "open" even
    // though `loadBillStatus` already correctly reports it `closed`. Nothing
    // money-correctness-related is affected — only this one list view.
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await closeBillWithCashPayment(deps, billId, 1_000)
    evolu.update("bill", { id: billId, closedAt: null })
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(billId)))
      .toMatchObject([{ id: billId, closedAt: null }])

    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
    await expect
      .poll(() => run.ok(listOpenBills()))
      .toMatchObject([{ bill: { id: billId } }])
  }, 15_000)

  test("adds catalog, manual amount, and tip lines to a bill", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const billId = await createOpenBill(deps)
    const catalogItemId = await run.ok(
      createCatalogItem({
        deviceId: null,
        categoryId: null,
        name: NonEmptyString255("Coffee"),
        description: NonEmptyString255("Double espresso"),
        currency: "CZK",
        unitAmount: NonNegativeInteger(5_900),
        sortOrder: NonNegativeInteger(10),
        scanCode: null,
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
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
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
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
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
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
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
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
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

  test("rejects adding or removing lines on a canceled or closed bill", async () => {
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
    const closedBillId = await createOpenBill(deps, { displayNumber: 2 })
    await closeBillWithCashPayment(deps, closedBillId, 1_000)

    for (const billId of [canceledBillId, closedBillId]) {
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

  test("rejects canceling a closed bill but allows re-canceling a canceled one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const closedBillId = await createOpenBill(deps, { displayNumber: 1 })
    await closeBillWithCashPayment(deps, closedBillId, 1_000)

    await expect(run(cancelBill(closedBillId))).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "closed" },
    })

    const canceledBillId = await createOpenBill(deps, { displayNumber: 2 })
    await run.orThrow(cancelBill(canceledBillId))
    await expect(run.orThrow(cancelBill(canceledBillId))).resolves.toBe(
      canceledBillId
    )
  }, 15_000)

  test("rejects closing a canceled bill but allows re-closing an already-closed one", async () => {
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

    await expect(run(closeBill(canceledBillId))).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotOpen", status: "canceled" },
    })

    // `closeBill` is a repair tool for the `closedAt` cache, not the normal
    // closing path — get the bill covered via a real claim first (which
    // already sets `closedAt` automatically), then null it out to simulate
    // the write never landing (the multi-device race `bill.ts`'s doc
    // comment describes), and verify `closeBill` can both repair it and be
    // called again afterward as an idempotent no-op.
    const closedBillId = await createOpenBill(deps, { displayNumber: 2 })
    await closeBillWithCashPayment(deps, closedBillId, 1_000)
    evolu.update("bill", { id: closedBillId, closedAt: null })
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(closedBillId)))
      .toMatchObject([{ id: closedBillId, closedAt: null }])

    // The central guarantee this whole cache exists to make safe: the
    // *derived* status never depended on `closedAt` in the first place, so
    // it already reads `closed` here even though the cache is stale/absent
    // — nothing money-correctness-related needed `closeBill` to run yet.
    // See docs/bill-payment-states.md's "`closedAt` is a cache, not a
    // status".
    await expect(run.orThrow(loadBillStatus(closedBillId))).resolves.toBe(
      "closed"
    )

    await run.orThrow(closeBill(closedBillId))
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(closedBillId)))
      .toSatisfy((rows) => rows[0]?.closedAt !== null)

    await expect(run.orThrow(closeBill(closedBillId))).resolves.toBe(
      closedBillId
    )
  }, 15_000)

  test("rejects manually closing an underpaid bill, but allows a fully covered one", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const underpaidBillId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(
      addManualAmountToBill({
        billId: underpaidBillId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )

    // No payment was ever claimed for this bill — `closeBill` must not be
    // able to produce a `closed`+`underpaid` bill; docs/bill-payment-states.md
    // states that combination can never occur.
    await expect(run(closeBill(underpaidBillId))).resolves.toMatchObject({
      ok: false,
      error: {
        type: "BillUnderpaid",
        id: underpaidBillId,
        billTotal: 1_000,
        claimedSum: 0,
      },
    })
    await expect(run.orThrow(loadBillStatus(underpaidBillId))).resolves.toBe(
      "open"
    )

    // An empty bill (billTotal 0, no payments) is trivially "paid" by
    // `deriveBillCoverage`'s own definition, but `closeBill` still requires
    // an actual claim — otherwise a brand-new, still-empty cart would read
    // as closeable the instant it's created. See `deriveBillStatus`'s doc
    // comment in bill-utils.ts.
    const emptyBillId = await createOpenBill(deps, { displayNumber: 2 })
    await expect(run(closeBill(emptyBillId))).resolves.toMatchObject({
      ok: false,
      error: { type: "BillUnderpaid", id: emptyBillId },
    })

    // A bill covered by an actual claim can be closed manually, including
    // repairing a `closedAt` cache that never got written.
    const coveredBillId = await createOpenBill(deps, { displayNumber: 3 })
    await closeBillWithCashPayment(deps, coveredBillId, 1_000)
    evolu.update("bill", { id: coveredBillId, closedAt: null })

    await expect(run.orThrow(closeBill(coveredBillId))).resolves.toBe(
      coveredBillId
    )
    await expect(
      run.ok(loadBillCoverage(coveredBillId))
    ).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_000,
      coverage: "paid",
    })
  }, 15_000)

  test("resolves a canceled+funded collision back to closed via confirmBillClosedDespiteCancellation", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cash register"),
        cashRegister: { currency: "CZK" },
      })
    )

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId },
      })
    )

    // Staff discards the cart while the payment is still pending (allowed —
    // `cancelBill` doesn't consult the editing lock) ...
    await run.orThrow(cancelBill(billId))
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("canceled")

    // ... and the payment is confirmed anyway. The bill's derived status
    // stays `canceled` even though it's now fully covered — the collision.
    await run.orThrow(markPaymentPaidCash({ paymentId, accountId }))
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("canceled")

    await expect(
      run.orThrow(confirmBillClosedDespiteCancellation(billId))
    ).resolves.toBe(billId)
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    // `canceledAt` itself is never touched — only the derived status flips.
    await expect
      .poll(() => evolu.loadQuery(billByIdQuery(billId)))
      .toSatisfy((rows) => rows[0]?.canceledAt !== null)
  }, 15_000)

  test("resolves a canceled+overpaid collision too — the guard only rejects underpaid, not overpaid", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cash register"),
        cashRegister: { currency: "CZK" },
      })
    )

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_500),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId },
      })
    )

    await run.orThrow(cancelBill(billId))
    await run.orThrow(markPaymentPaidCash({ paymentId, accountId }))
    await expect(run.ok(loadBillCoverage(billId))).resolves.toMatchObject({
      billTotal: 1_000,
      claimedSum: 1_500,
      coverage: "overpaid",
    })
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("canceled")

    await expect(
      run.orThrow(confirmBillClosedDespiteCancellation(billId))
    ).resolves.toBe(billId)
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
  }, 15_000)

  test("calling confirmBillClosedDespiteCancellation again on an already-resolved bill is an idempotent no-op", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Cash register"),
        cashRegister: { currency: "CZK" },
      })
    )

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    const paymentId = await run.orThrow(
      createPayment({
        deviceId: null,
        billId,
        tableId: null,
        amount: NonNegativeInteger(1_000),
        currency: "CZK",
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        expiresAt: null,
        cashRegister: { accountId },
      })
    )
    await run.orThrow(cancelBill(billId))
    await run.orThrow(markPaymentPaidCash({ paymentId, accountId }))
    await run.orThrow(confirmBillClosedDespiteCancellation(billId))
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")

    await expect(
      run.orThrow(confirmBillClosedDespiteCancellation(billId))
    ).resolves.toBe(billId)
    await expect(run.orThrow(loadBillStatus(billId))).resolves.toBe("closed")
  }, 15_000)

  test("rejects confirmBillClosedDespiteCancellation on a bill that isn't canceled", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await closeBillWithCashPayment(deps, billId, 1_000)

    await expect(
      run(confirmBillClosedDespiteCancellation(billId))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "BillNotCanceled", id: billId },
    })
  }, 15_000)

  test("rejects confirmBillClosedDespiteCancellation on a canceled bill with no active claim", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const billId = await createOpenBill(deps, { displayNumber: 1 })
    await run.orThrow(
      addManualAmountToBill({
        billId,
        deviceId: null,
        name: NonEmptyString255("Dinner"),
        currency: "CZK",
        totalAmount: NonNegativeInteger(1_000),
      })
    )
    await run.orThrow(cancelBill(billId))

    await expect(
      run(confirmBillClosedDespiteCancellation(billId))
    ).resolves.toMatchObject({
      ok: false,
      error: { type: "BillUnderpaid", id: billId },
    })
  }, 15_000)
})
