import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillLineIdRaw = id("BillLine")
export const BillLineId = standardSchemaToZod(BillLineIdRaw)
export type BillLineId = typeof BillLineIdRaw.Type
