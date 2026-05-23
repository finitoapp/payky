import { createIdFromString } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import { createCatalogItemSnapshot } from "@/core/modules/item/item-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  type ItemLineType,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { BillLineSummary } from "./bill-line-summary.ts"
import { billLinesByBillIdQuery } from "./bill-queries.ts"
import type { BillId } from "./bill-types.ts"

interface BillLineSummaryIdentityInput {
  readonly billId: BillId
  readonly catalogItemId: BillLineSummary["catalogItemId"]
  readonly itemId: BillLineSummary["itemId"]
  readonly type: ItemLineType
}

export const createBillLineSummaryId = (
  input: BillLineSummaryIdentityInput
): string =>
  createIdFromString<"BillLineSummary">(
    JSON.stringify({
      billId: input.billId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )

export const createOrReuseItemSnapshot =
  (deps: EvoluDep & EvoluOwnerIdDep) =>
  async (snapshot: ItemRow): Promise<ItemRow> => {
    const { evoluOwnerId } = deps

    await runMutationWithCompletion((options) =>
      deps.evolu.upsert("item", snapshot, { ...options, ownerId: evoluOwnerId })
    )
    return snapshot
  }

export const createOrReuseCatalogItemSnapshot =
  (deps: EvoluDep & EvoluOwnerIdDep) =>
  async (catalogItem: CatalogItemRow): Promise<ItemRow> =>
    createOrReuseItemSnapshot(deps)(createCatalogItemSnapshot(catalogItem))

export const calculateBillLineSummaries = (
  lineRows: ReadonlyArray<BillLineRow>,
  itemRows: ReadonlyArray<ItemRow>
): ReadonlyArray<BillLineSummary> => {
  const itemsById = new Map(itemRows.map((item) => [item.id, item]))
  const projected = new Map<string, BillLineSummary>()

  for (const line of lineRows) {
    const item = itemsById.get(line.itemId)
    if (item == null) {
      continue
    }

    const idValue = createBillLineSummaryId({
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

export const loadCalculatedBillLineSummaries =
  (deps: EvoluDep) =>
  async (billId: BillId): Promise<ReadonlyArray<BillLineSummary>> => {
    const [lineRows, itemRows] = await Promise.all([
      deps.evolu.loadQuery(billLinesByBillIdQuery(billId)),
      deps.evolu.loadQuery(itemsQuery),
    ])

    return calculateBillLineSummaries(lineRows, itemRows)
  }
export const appendBillLines =
  (deps: EvoluDep & EvoluOwnerIdDep) =>
  async (
    lines: ReadonlyArray<Omit<BillLineRow, "id">>,
    returnBillId?: BillId
  ): Promise<ReadonlyArray<BillLineSummary>> => {
    const { evoluOwnerId } = deps

    if (lines.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const line of lines) {
          deps.evolu.insert("billLine", removeUndefinedValues(line), {
            ...options,
            ownerId: evoluOwnerId,
          })
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
    const summariesByBill = new Map(
      await Promise.all(
        [...billIds].map(
          async (lineBillId) =>
            [
              lineBillId,
              await loadCalculatedBillLineSummaries(deps)(lineBillId),
            ] as const
        )
      )
    )

    return summariesByBill.get(targetBillId) ?? []
  }

export const appendBillLine =
  (deps: EvoluDep & EvoluOwnerIdDep) =>
  async (
    line: Omit<BillLineRow, "id">
  ): Promise<ReadonlyArray<BillLineSummary>> => {
    return appendBillLines(deps)([line])
  }
