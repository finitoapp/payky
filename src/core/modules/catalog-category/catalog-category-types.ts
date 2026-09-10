import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const CatalogCategoryIdRaw = id("CatalogCategory")
export const CatalogCategoryId = standardSchemaToZod(CatalogCategoryIdRaw)
export type CatalogCategoryId = typeof CatalogCategoryIdRaw.Output
