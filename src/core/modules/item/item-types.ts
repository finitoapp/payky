import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const ItemIdRaw = id("Item")
export const ItemId = standardSchemaToZod(ItemIdRaw)
export type ItemId = typeof ItemIdRaw.Output
