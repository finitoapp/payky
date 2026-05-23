import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const PaymentIdRaw = id("Payment")
export const PaymentId = standardSchemaToZod(PaymentIdRaw)
export type PaymentId = typeof PaymentIdRaw.Type
