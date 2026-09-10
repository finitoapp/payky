import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createBillAtEnd } from "@/core/modules/bill/bill-actions.ts"
import { latestBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import {
  type BillId,
  createRandomBillId,
} from "@/core/modules/bill/bill-types.ts"
import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"
import { appendBillLines } from "@/core/modules/bill-line/bill-line-actions.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { createOrReuseItemSnapshot } from "@/core/modules/item/item-actions.ts"
import {
  itemsByBillIdQuery,
  itemsByPaymentIdQuery,
} from "@/core/modules/item/item-queries.ts"
import { createStandaloneItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { insertPaymentLineRows } from "@/core/modules/payment-line/payment-line-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import { createEvoluTest } from "../../evolu/cli-client"

const snapshot = (name: string, unitAmount: number): ItemRow =>
  createStandaloneItemSnapshot({
    catalogItemId: null,
    name,
    description: null,
    currency: "CZK",
    unitAmount,
  } as Omit<ItemRow, "id">)

const line = (
  billId: BillId,
  item: ItemRow,
  totalAmount: number
): Omit<BillLineRow, "id"> =>
  ({
    billId,
    deviceId: null,
    catalogItemId: null,
    itemId: item.id,
    type: "catalogItem",
    kind: "add",
    quantity: 1,
    totalAmount,
  }) as Omit<BillLineRow, "id">

describe("scoped item queries", () => {
  test("itemsByBillIdQuery returns only the bill's own items", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const otherBillId = "bill-2" as BillId
    const coffee = snapshot("Coffee", 5900)
    const tea = snapshot("Tea", 4200)
    await run.ok(createOrReuseItemSnapshot(coffee))
    await run.ok(createOrReuseItemSnapshot(tea))
    await run.ok(
      appendBillLines([
        line(billId, coffee, 5900),
        line(otherBillId, tea, 4200),
      ])
    )

    // `tea`'s snapshot exists and is on another bill: the point of the scope
    // is that it does not come back here.
    await expect(evolu.loadQuery(itemsByBillIdQuery(billId))).resolves.toEqual([
      expect.objectContaining({ id: coffee.id, name: "Coffee" }),
    ])
  }, 15_000)

  test("itemsByBillIdQuery returns a shared snapshot once, not once per line", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const coffee = snapshot("Coffee", 5900)
    await run.ok(createOrReuseItemSnapshot(coffee))
    await run.ok(
      appendBillLines([
        line(billId, coffee, 5900),
        line(billId, coffee, 5900),
        line(billId, coffee, 5900),
      ])
    )

    await expect(
      evolu.loadQuery(itemsByBillIdQuery(billId))
    ).resolves.toHaveLength(1)
  }, 15_000)

  test("itemsByPaymentIdQuery resolves an item the bill no longer carries", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = "bill-1" as BillId
    const paymentId = "payment-1" as PaymentId
    const removed = snapshot("Removed cake", 7500)
    await run.ok(createOrReuseItemSnapshot(removed))

    // The payment froze a line for `removed`, but the bill never carries a
    // `billLine` for it — the line was taken off after the payment was made.
    // A bill-scoped item load would drop this row, and the diff would report
    // nothing instead of reporting the removal.
    await runMutationWithCompletion((options) =>
      insertPaymentLineRows(
        evolu,
        [
          {
            paymentId,
            billId,
            catalogItemId: null,
            itemId: removed.id,
            type: "catalogItem",
            quantity: 1,
            totalAmount: 7500,
          } as Omit<Parameters<typeof insertPaymentLineRows>[1][number], never>,
        ],
        { ...options, ownerId: evolu.appOwner.id }
      )
    )

    await expect(evolu.loadQuery(itemsByBillIdQuery(billId))).resolves.toEqual(
      []
    )
    await expect(
      evolu.loadQuery(itemsByPaymentIdQuery(paymentId))
    ).resolves.toEqual([
      expect.objectContaining({ id: removed.id, name: "Removed cake" }),
    ])
  }, 15_000)

  test("latestBillsQuery embeds each bill's own item snapshots", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const billId = createRandomBillId()
    const coffee = snapshot("Coffee", 5900)
    const tea = snapshot("Tea", 4200)
    await run.ok(createOrReuseItemSnapshot(coffee))
    await run.ok(createOrReuseItemSnapshot(tea))
    await run.ok(
      appendBillLines([line(billId, coffee, 5900), line(billId, tea, 4200)])
    )
    await run.ok(
      createBillAtEnd({
        id: billId,
        deviceId: null,
        label: null,
        tableId: null,
        currency: "CZK",
      })
    )

    const [billRow] = await evolu.loadQuery(latestBillsQuery({ limit: 10 }))
    expect(billRow?.items.map((item) => item.name).sort()).toEqual([
      "Coffee",
      "Tea",
    ])
  }, 15_000)
})
