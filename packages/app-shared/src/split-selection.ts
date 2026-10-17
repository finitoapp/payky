import type { BillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import { getBillLineSummaryUnitAmount } from "@payky/core/modules/bill-line/bill-line-utils"
import {
  NonNegativeInteger,
  PositiveNumber,
} from "@payky/core/modules/shared/schema"

/** How many units of each line, keyed by `BillLineSummary["id"]`, are picked to move. */
export type SplitSelection = Readonly<Record<string, number>>

export type SplitDestination = "new" | "existing"

export type SplitBillConfirmInput =
  | {
      readonly destination: "new"
      readonly items: ReadonlyArray<BillLineSummary>
    }
  | {
      readonly destination: "existing"
      readonly targetBillId: BillId
      readonly items: ReadonlyArray<BillLineSummary>
    }

/** Sets one line's picked quantity, kept between 0 and what the bill holds. */
export const setSplitQuantity = (
  selection: SplitSelection,
  summary: Pick<BillLineSummary, "id" | "quantity">,
  quantity: number
): SplitSelection => ({
  ...selection,
  [summary.id]: Math.min(Math.max(quantity, 0), summary.quantity),
})

export const selectAllForSplit = (
  summaries: ReadonlyArray<Pick<BillLineSummary, "id" | "quantity">>
): SplitSelection =>
  Object.fromEntries(summaries.map((summary) => [summary.id, summary.quantity]))

/**
 * The picked lines with `quantity`/`totalAmount` reduced to the moved portion,
 * which is what `splitBill`/`splitBillIntoNewBill` take.
 */
export const deriveSplitItems = (
  summaries: ReadonlyArray<BillLineSummary>,
  selection: SplitSelection
): ReadonlyArray<BillLineSummary> =>
  summaries.flatMap((summary): BillLineSummary[] => {
    const quantity = selection[summary.id] ?? 0
    if (quantity <= 0) return []

    const unitAmount = getBillLineSummaryUnitAmount(summary)
    return [
      {
        ...summary,
        quantity: PositiveNumber(quantity),
        totalAmount: NonNegativeInteger(unitAmount * quantity),
      },
    ]
  })

export const canConfirmSplit = ({
  itemCount,
  pending,
  destination,
  targetBillId,
}: {
  readonly itemCount: number
  readonly pending: boolean
  readonly destination: SplitDestination
  readonly targetBillId: BillId | null
}): boolean =>
  itemCount > 0 && !pending && (destination === "new" || targetBillId !== null)
