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

export const getBillLineSummaryUnitAmount = (summary: BillLineSummary) =>
  NonNegativeInteger(summary.totalAmount / summary.quantity)
