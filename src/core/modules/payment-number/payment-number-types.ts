import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const PaymentLastNumberIdRaw = id("PaymentLastNumber")
export const PaymentLastNumberId = standardSchemaToZod(PaymentLastNumberIdRaw)
export type PaymentLastNumberId = typeof PaymentLastNumberIdRaw.Output
