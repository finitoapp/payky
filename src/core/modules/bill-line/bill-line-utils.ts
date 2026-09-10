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

/**
 * Measured before anyone optimises it: the `JSON.stringify` + SHA-256 here is
 * 70–100% of `calculateBillLineSummaries`' own cost, and the projection is
 * still 0.065 ms for a 20-line bill, 0.6 ms at 200 lines, 6.3 ms at 2000.
 * A 30-bill floor view costs 1.8 ms for the whole list, and each card
 * `useMemo`s on its own row, so that is a first paint rather than a frame
 * cost. Nothing here is worth a cache; if it ever is, note that every line of
 * the same item re-hashes the same four fields, so a `Map` on that tuple is
 * the cheap win.
 */
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

/**
 * A bill's item count and total, from its already-calculated summaries —
 * shared by every occupancy-style tile/row that shows just those two numbers
 * (the POS floor view's `OccupiedTableSummary`, the split dialog's
 * existing-bill picker) so none of them re-derives its own reduce.
 */
export const deriveBillSummaryStats = (
  summaries: ReadonlyArray<BillLineSummary>
): {
  readonly itemCount: number
  readonly totalAmount: NonNegativeInteger
} => ({
  itemCount: summaries.reduce((sum, summary) => sum + summary.quantity, 0),
  totalAmount: NonNegativeInteger(
    summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
  ),
})

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
 * Matches first on the summary's own id — `createBillLineSummaryId`, over
 * `(billId, catalogItemId, itemId, type)`. An exact match with an unchanged
 * `quantity`/`totalAmount` is not reported at all; one whose amount differs
 * (more/fewer of the same exact item) is `changed`.
 *
 * Deliberately *not* keyed on `itemId` alone, even though that is the
 * content-addressed "same name, description, currency and unit price" identity
 * this comment used to point at. `createItemIdFromSnapshot` leaves the line's
 * `type` out of that hash, so a tip and a manual amount with the same name and
 * amount share one `itemId` while being two separate lines. Keying on it
 * collapsed them: a tip whose total had moved was reported as the *manual
 * amount* having turned into it, and the manual-amount line vanished from the
 * diff — or, with one on each side, an equal tip-for-manual-amount swap read
 * as "nothing changed".
 *
 * A line present on only one side is then correlated by `catalogItemId` (the
 * menu item's identity, independent of its price) against the lines present
 * only on the other — this is what turns "removed: old-price Coffee, added:
 * new-price Coffee" into a single `changed` entry instead of an
 * unrelated-looking add and remove. Correlation candidates are grouped as a
 * *list* per catalog item, consumed in order: the same menu item can sit on
 * the bill under several price snapshots at once (repriced twice while a
 * payment was outstanding), and keeping only one candidate per catalog item
 * paired one of them and left the rest reading as an unrelated add + remove.
 * Both sides arrive in the fold's own deterministic order, so the pairing is
 * stable. Only what's left after that is a genuine `added`/`removed`. See
 * docs/bill-payment-states.md.
 */
export const deriveBillLineSummaryDiff = (
  expected: ReadonlyArray<BillLineSummary>,
  current: ReadonlyArray<BillLineSummary>
): BillLineSummaryDiff => {
  const currentById = new Map(current.map((summary) => [summary.id, summary]))
  const matchedCurrentIds = new Set<BillLineSummary["id"]>()

  const changed: BillLineSummaryChange[] = []
  const unmatchedExpected: BillLineSummary[] = []

  for (const before of expected) {
    const after = currentById.get(before.id)
    if (after === undefined) {
      unmatchedExpected.push(before)
      continue
    }

    matchedCurrentIds.add(after.id)
    if (
      after.quantity !== before.quantity ||
      after.totalAmount !== before.totalAmount
    ) {
      changed.push({ before, after })
    }
  }

  const unmatchedCurrent = current.filter(
    (summary) => !matchedCurrentIds.has(summary.id)
  )
  // A list per catalog item, not one entry: see the doc comment above.
  const candidatesByCatalogItemId = new Map<
    NonNullable<BillLineSummary["catalogItemId"]>,
    BillLineSummary[]
  >()
  for (const summary of unmatchedCurrent) {
    if (summary.catalogItemId === null) continue
    const candidates = candidatesByCatalogItemId.get(summary.catalogItemId)
    if (candidates === undefined) {
      candidatesByCatalogItemId.set(summary.catalogItemId, [summary])
    } else {
      candidates.push(summary)
    }
  }

  const removed: BillLineSummary[] = []
  const claimedCurrentIds = new Set<BillLineSummary["id"]>()

  for (const before of unmatchedExpected) {
    // `shift` consumes the candidate so the next expected line for the same
    // catalog item pairs with the following one instead of re-claiming it.
    const after =
      before.catalogItemId === null
        ? undefined
        : candidatesByCatalogItemId.get(before.catalogItemId)?.shift()
    if (after === undefined) {
      removed.push(before)
      continue
    }

    changed.push({ before, after })
    claimedCurrentIds.add(after.id)
  }

  const added = unmatchedCurrent.filter(
    (summary) => !claimedCurrentIds.has(summary.id)
  )

  return { added, removed, changed }
}
