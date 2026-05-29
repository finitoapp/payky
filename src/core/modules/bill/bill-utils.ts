import { SqliteBoolean } from "@evolu/common"

import type { BillItemRow } from "@/core/modules/bill-item/bill-item.ts"
import { createBillItemId } from "@/core/modules/bill-item/bill-item-utils.ts"
import type { BillItemLineRow } from "@/core/modules/bill-item-line/bill-item-line.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import { createCatalogItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { billLinesByBillIdQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

export const createOrReuseItemSnapshot =
  (deps: EvoluDep) =>
  async (snapshot: ItemRow): Promise<ItemRow> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.upsert("item", snapshot, options)
    )
    return snapshot
  }

export const createOrReuseCatalogItemSnapshot =
  (deps: EvoluDep) =>
  async (catalogItem: CatalogItemRow): Promise<ItemRow> =>
    createOrReuseItemSnapshot(deps)(createCatalogItemSnapshot(catalogItem))

export const calculateBillItems = (
  lineRows: ReadonlyArray<BillItemLineRow>,
  itemRows: ReadonlyArray<ItemRow>
): ReadonlyArray<BillItemRow> => {
  const itemsById = new Map(itemRows.map((item) => [item.id, item]))
  const projected = new Map<string, BillItemRow>()

  for (const line of lineRows) {
    const item = itemsById.get(line.itemId)
    if (item == null) {
      continue
    }

    const idValue = createBillItemId({
      billId: line.billId,
      catalogItemId: line.catalogItemId,
      itemId: line.itemId,
      type: line.type,
    })
    const existing = projected.get(idValue)
    const direction = line.kind === "add" ? 1 : -1
    const nextQuantity = (existing?.quantity ?? 0) + direction * line.quantity
    const nextTotalAmount =
      (existing?.totalAmount ?? 0) + direction * line.totalAmount

    if (nextQuantity <= 0) {
      projected.delete(idValue)
      continue
    }

    projected.set(idValue, {
      id: idValue,
      billId: line.billId,
      catalogItemId: line.catalogItemId,
      itemId: line.itemId,
      type: line.type,
      name: item.name,
      description: item.description,
      currency: item.currency,
      quantity: PositiveNumber(nextQuantity),
      totalAmount: NonNegativeInteger(Math.max(0, nextTotalAmount)),
    })
  }

  return [...projected.values()]
}

export const loadCalculatedBillItems =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<ReadonlyArray<BillItemRow>> => {
    const [lineRows, itemRows] = await Promise.all([
      deps.evolu.loadQuery(billLinesByBillIdQuery(billId)),
      deps.evolu.loadQuery(itemsQuery),
    ])

    return calculateBillItems(lineRows, itemRows)
  }

export const syncBillItemProjection =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<ReadonlyArray<BillItemRow>> => {
    const [lineRows, itemRows] = await Promise.all([
      deps.evolu.loadQuery(billLinesByBillIdQuery(billId)),
      deps.evolu.loadQuery(itemsQuery),
    ])
    const projected = calculateBillItems(lineRows, itemRows)
    const projectedIds = new Set(projected.map((billItem) => billItem.id))
    const billItemIdsToDelete = new Set<BillItemRow["id"]>()

    for (const line of lineRows) {
      const idValue = createBillItemId({
        billId: line.billId,
        catalogItemId: line.catalogItemId,
        itemId: line.itemId,
        type: line.type,
      })
      if (!projectedIds.has(idValue)) {
        billItemIdsToDelete.add(idValue)
      }
    }

    if (billItemIdsToDelete.size > 0 || projected.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const id of billItemIdsToDelete) {
          deps.evolu.update(
            "billItem",
            {
              id,
              isDeleted: SqliteBoolean.orThrow(1),
            },
            options
          )
        }
        for (const billItem of projected) {
          deps.evolu.upsert("billItem", billItem, options)
        }
      })
    }

    return projected
  }

export const appendBillItemLines =
  (deps: EvoluDep) =>
  async (
    lines: ReadonlyArray<Omit<BillItemLineRow, "id">>,
    returnBillId?: BillId
  ): Promise<ReadonlyArray<BillItemRow>> => {
    if (lines.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const line of lines) {
          deps.evolu.insert(
            "billItemLine",
            removeUndefinedValues(line),
            options
          )
        }
      })
    }

    const targetBillId = returnBillId ?? lines.at(-1)?.billId
    if (targetBillId == null) {
      return []
    }

    const billIds = new Set<BillId>([targetBillId])
    for (const line of lines) {
      billIds.add(line.billId)
    }
    const projectedByBill = new Map(
      await Promise.all(
        [...billIds].map(
          async (lineBillId) =>
            [
              lineBillId,
              await syncBillItemProjection(deps)(lineBillId),
            ] as const
        )
      )
    )

    return projectedByBill.get(targetBillId) ?? []
  }

export const appendBillItemLine =
  (deps: EvoluDep) =>
  async (
    line: Omit<BillItemLineRow, "id">
  ): Promise<ReadonlyArray<BillItemRow>> => {
    return appendBillItemLines(deps)([line])
  }
