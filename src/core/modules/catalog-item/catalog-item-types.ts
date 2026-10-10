import { id } from "@evolu/common"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const CatalogItemIdRaw = id("CatalogItem")
export const CatalogItemId = standardSchemaToZod(CatalogItemIdRaw)
export type CatalogItemId = typeof CatalogItemIdRaw.Output

export type CategoryFilter = "all" | "uncategorized" | CatalogCategoryId
