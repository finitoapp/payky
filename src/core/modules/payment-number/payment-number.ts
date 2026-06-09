import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { PaymentLastNumberId } from "@/core/modules/payment-number/payment-number-types.ts"
import {
  DateStringSchema,
  type InferTable,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"

export const paymentNumber = {
  id: PaymentId,
  serialNumber: NonNegativeIntegerSchema,
  date: DateStringSchema.nullable(),
} as const

export const paymentLastNumber = {
  id: PaymentLastNumberId,
  serialNumber: NonNegativeIntegerSchema,
  date: DateStringSchema.nullable(),
} as const

export type PaymentNumberRow = InferTable<typeof paymentNumber>
export type PaymentLastNumberRow = InferTable<typeof paymentLastNumber>
