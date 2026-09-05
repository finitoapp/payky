import { createIdFromString } from "@evolu/common"

import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { ItemRow } from "@/core/modules/item/item.ts"
import {
  type ItemLineType,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { BillLineRow } from "./bill-line.ts"
import type { BillLineSummary } from "./bill-line-summary.ts"
import type { BillLineSummaryId } from "./bill-line-types.ts"

interface BillLineSummaryIdentityInput {
  readonly billId: BillId
  readonly catalogItemId: BillLineSummary["catalogItemId"]
  readonly itemId: BillLineSummary["itemId"]
  readonly type: ItemLineType
}

export const createBillLineSummaryId = (
  input: BillLineSummaryIdentityInput
): BillLineSummaryId =>
  createIdFromString<"BillLineSummary">(
    JSON.stringify({
      billId: input.billId,
      catalogItemId: input.catalogItemId,
      itemId: input.itemId,
      type: input.type,
    })
  )

export const calculateBillLineSummaries = (
  lineRows: ReadonlyArray<BillLineRow>,
  itemRows: ReadonlyArray<ItemRow>
): ReadonlyArray<BillLineSummary> => {
  const itemsById = new Map(itemRows.map((item) => [item.id, item]))
  const projected = new Map<BillLineSummaryId, BillLineSummary>()

  for (const line of lineRows) {
    const item = itemsById.get(line.itemId)
    if (item === undefined) {
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
      taxRateId: item.taxRateId,
    })
  }

  return [...projected.values()]
}

export interface BillLineSummaryChange {
  readonly before: BillLineSummary
  readonly after: BillLineSummary
}

export interface BillLineSummaryDiff {
  readonly added: ReadonlyArray<BillLineSummary>
  readonly removed: ReadonlyArray<BillLineSummary>
  readonly changed: ReadonlyArray<BillLineSummaryChange>
}

/**
 * Compares two `BillLineSummary` snapshots — typically a payment's frozen
 * `paymentLine` snapshot (`expected`, see `paymentLinesToBillLineSummaries`)
 * against the bill's live summaries (`current`, see
 * `calculateBillLineSummaries`) — and reports what changed between them.
 *
 * Matches primarily by `itemId`, which is content-addressed (same name,
 * description, currency, and unit price ⇒ same id): an exact match with an
 * unchanged `quantity`/`totalAmount` is not reported at all. An exact match
 * whose amount differs (more/fewer of the same exact item) is `changed`.
 *
 * A line present on only one side is then correlated by `catalogItemId`
 * (the menu item's identity, independent of its price) against a line
 * present on only the other side — this is what turns "removed: old-price
 * Coffee, added: new-price Coffee" into a single `changed` entry instead of
 * an unrelated-looking add and remove. Only what's left after that is a
 * genuine `added`/`removed`. See docs/bill-payment-states.md.
 */
export const deriveBillLineSummaryDiff = (
  expected: ReadonlyArray<BillLineSummary>,
  current: ReadonlyArray<BillLineSummary>
): BillLineSummaryDiff => {
  const currentByItemId = new Map(
    current.map((summary) => [summary.itemId, summary])
  )
  const matchedCurrentItemIds = new Set<BillLineSummary["itemId"]>()

  const changed: BillLineSummaryChange[] = []
  const unmatchedExpected: BillLineSummary[] = []

  for (const before of expected) {
    const after = currentByItemId.get(before.itemId)
    if (after === undefined) {
      unmatchedExpected.push(before)
      continue
    }

    matchedCurrentItemIds.add(after.itemId)
    if (
      after.quantity !== before.quantity ||
      after.totalAmount !== before.totalAmount
    ) {
      changed.push({ before, after })
    }
  }

  const unmatchedCurrent = current.filter(
    (summary) => !matchedCurrentItemIds.has(summary.itemId)
  )
  const unmatchedCurrentByCatalogItemId = new Map(
    unmatchedCurrent
      .filter(
        (
          summary
        ): summary is BillLineSummary & {
          catalogItemId: NonNullable<BillLineSummary["catalogItemId"]>
        } => summary.catalogItemId !== null
      )
      .map((summary) => [summary.catalogItemId, summary])
  )

  const removed: BillLineSummary[] = []
  const claimedCurrentItemIds = new Set<BillLineSummary["itemId"]>()

  for (const before of unmatchedExpected) {
    const after =
      before.catalogItemId !== null
        ? unmatchedCurrentByCatalogItemId.get(before.catalogItemId)
        : undefined
    if (after !== undefined && !claimedCurrentItemIds.has(after.itemId)) {
      changed.push({ before, after })
      claimedCurrentItemIds.add(after.itemId)
    } else {
      removed.push(before)
    }
  }

  const added = unmatchedCurrent.filter(
    (summary) => !claimedCurrentItemIds.has(summary.itemId)
  )

  return { added, removed, changed }
}
