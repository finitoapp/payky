import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillItemLineIdRaw = id("BillItemLine")
export const BillItemLineId = standardSchemaToZod(BillItemLineIdRaw)
export type BillItemLineId = typeof BillItemLineIdRaw.Type
