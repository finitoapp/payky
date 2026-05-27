import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const BillIdRaw = id("Bill")
export const BillId = standardSchemaToZod(BillIdRaw)
export type BillId = typeof BillIdRaw.Type
