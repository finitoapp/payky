import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"

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
