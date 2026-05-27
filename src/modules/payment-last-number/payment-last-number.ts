import { PaymentLastNumberId } from "@/modules/payment-last-number/payment-last-number-types.ts"
import {
  DateStringSchema,
  type InferTable,
  NonNegativeIntegerSchema,
} from "@/modules/shared/schema.ts"

export const paymentLastNumber = {
  id: PaymentLastNumberId,
  serialNumber: NonNegativeIntegerSchema,
  date: DateStringSchema.nullable(),
} as const

export type PaymentLastNumberRow = InferTable<typeof paymentLastNumber>
