import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const PaymentLineIdRaw = id("PaymentLine")
export const PaymentLineId = standardSchemaToZod(PaymentLineIdRaw)
export type PaymentLineId = typeof PaymentLineIdRaw.Type
