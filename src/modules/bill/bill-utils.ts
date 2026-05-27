import { SqliteBoolean } from "@evolu/common"

import type { BillItemRow } from "@/modules/bill-item/bill-item.ts"
import { createBillItemId } from "@/modules/bill-item/bill-item-utils.ts"
import type { BillItemLineRow } from "@/modules/bill-item-line/bill-item-line.ts"
import type { CatalogItemRow } from "@/modules/catalog-item/catalog-item.ts"
import type { ItemRow } from "@/modules/item/item.ts"
import { itemsQuery } from "@/modules/item/item-queries.ts"
import { createCatalogItemSnapshot } from "@/modules/item/item-utils.ts"
import type { EvoluDep } from "@/modules/shared/evolu-deps.ts"
import { NonNegativeInteger, PositiveInteger } from "@/modules/shared/schema.ts"
import { removeUndefinedValues } from "@/modules/shared/utils.ts"
import { billLinesByBillIdQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

export const createOrReuseItemSnapshot =
  (deps: EvoluDep) =>
  (snapshot: ItemRow): ItemRow => {
    deps.evolu.upsert("item", snapshot)
    return snapshot
  }

export const createOrReuseCatalogItemSnapshot =
  (deps: EvoluDep) =>
  (catalogItem: CatalogItemRow): ItemRow =>
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
    const nextQuantity = PositiveInteger(
      (existing?.quantity ?? 0) + direction * line.quantity
    )
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
      quantity: nextQuantity,
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

    for (const line of lineRows) {
      const idValue = createBillItemId({
        billId: line.billId,
        catalogItemId: line.catalogItemId,
        itemId: line.itemId,
        type: line.type,
      })
      if (!projectedIds.has(idValue)) {
        deps.evolu.update("billItem", {
          id: idValue,
          isDeleted: SqliteBoolean.orThrow(1),
        })
      }
    }

    for (const billItem of projected) {
      deps.evolu.upsert("billItem", billItem)
    }

    return projected
  }

export const appendBillItemLine =
  (deps: EvoluDep) =>
  async (
    line: Omit<BillItemLineRow, "id">
  ): Promise<ReadonlyArray<BillItemRow>> => {
    deps.evolu.insert("billItemLine", removeUndefinedValues(line))
    return syncBillItemProjection(deps)(line.billId)
  }
