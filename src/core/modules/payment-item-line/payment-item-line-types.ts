import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const PaymentItemLineIdRaw = id("PaymentItemLine")
export const PaymentItemLineId = standardSchemaToZod(PaymentItemLineIdRaw)
export type PaymentItemLineId = typeof PaymentItemLineIdRaw.Type
