import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"

/**
 * The name to show staff in the app (catalog list, item picker, scan
 * results). Prefers `internalName` over the public `name`. Never use this
 * for customer-facing output (bill/receipt line items) — those must keep
 * reading `name` directly, since the `item` snapshot taken when an item is
 * added to a bill only ever copies `name`/`description`.
 */
export const getStaffDisplayName = (item: CatalogItemRow): string =>
  item.internalName ?? item.name

/**
 * The description to show staff in the app. Prefers `internalDescription`
 * over the public `description`. Same customer-facing caveat as
 * `getStaffDisplayName` applies.
 */
export const getStaffDisplayDescription = (
  item: CatalogItemRow
): string | null => item.internalDescription ?? item.description

/**
 * Matches catalog items against a raw scanned code value. `scanCode`
 * uniqueness is not enforced anywhere (there is no server-side authority to
 * arbitrate concurrent devices assigning the same code), so more than one
 * match is an expected outcome callers must handle, not an error.
 */
export const findCatalogItemsByScanCode = (
  items: ReadonlyArray<CatalogItemRow>,
  rawValue: string
): ReadonlyArray<CatalogItemRow> => {
  const trimmed = rawValue.trim()
  if (trimmed === "") return []

  return items.filter((item) => item.scanCode === trimmed)
}

/**
 * Matches a catalog item against a free-text search query. Checks `name`,
 * `internalName`, `sku`, and `scanCode` so staff can find an item by whatever
 * identifier they have on hand, regardless of which name variant is shown.
 */
export const matchesCatalogItemSearch = (
  item: CatalogItemRow,
  query: string
): boolean => {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === "") return true

  return [item.name, item.internalName, item.sku, item.scanCode].some((field) =>
    field?.toLowerCase().includes(normalizedQuery)
  )
}
