import type { BillLineSummary } from "@/core/modules/bill-line/bill-line-summary.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"

/**
 * Returns the most recently represented snapshot for a catalog item. A cart
 * can retain more than one snapshot when a catalog item changes after it was
 * added, so decrementing must target a persisted summary rather than rebuild
 * the snapshot from the catalog's current values.
 */
export const getLatestCatalogItemSummary = (
  summaries: ReadonlyArray<BillLineSummary>,
  catalogItemId: CatalogItemId
): BillLineSummary | undefined =>
  summaries.findLast((summary) => summary.catalogItemId === catalogItemId)

/**
 * What one unit of a cart line costs, used to build a "remove one" line and to
 * price a partial split selection.
 *
 * Rounded, because the division does not reliably land on an integer even when
 * the line is perfectly ordinary. `quantity` is a `PositiveNumber`, not an
 * integer — `addCatalogItemToBill` and `bin/cli-bills.ts add-item` both accept
 * a fractional one — and 0.7 of a 2000 item stores a clean total of 1400 whose
 * `1400 / 0.7` is `2000.0000000000002` in IEEE 754. Decoding that straight
 * through `NonNegativeInteger` threw, while the operator was doing nothing
 * more exotic than tapping "remove" on that line.
 *
 * For a total that genuinely does not divide, the nearest minor unit is the
 * only answer available — money has no fractional one.
 */
export const getBillLineSummaryUnitAmount = (summary: BillLineSummary) =>
  NonNegativeInteger(Math.round(summary.totalAmount / summary.quantity))
