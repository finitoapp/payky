import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillItemIdRaw = id("BillItem")
export const BillItemId = standardSchemaToZod(BillItemIdRaw)
export type BillItemId = typeof BillItemIdRaw.Type
