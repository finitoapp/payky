import { id } from "@evolu/common"
import { standardSchemaToZod } from "../../zod-utils.ts"
import type { CatalogCategoryId } from "../catalog-category/catalog-category-types.ts"

export const CatalogItemIdRaw = id("CatalogItem")
export const CatalogItemId = standardSchemaToZod(CatalogItemIdRaw)
export type CatalogItemId = typeof CatalogItemIdRaw.Output

export type CategoryFilter = "all" | "uncategorized" | CatalogCategoryId
