import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const CatalogItemIdRaw = id("CatalogItem")
export const CatalogItemId = standardSchemaToZod(CatalogItemIdRaw)
export type CatalogItemId = typeof CatalogItemIdRaw.Type
