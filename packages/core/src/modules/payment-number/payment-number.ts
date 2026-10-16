import { PaymentId } from "../payment/payment-types.ts"
import {
  DateStringSchema,
  type InferTable,
  NonNegativeIntegerSchema,
} from "../shared/schema.ts"
import { PaymentLastNumberId } from "./payment-number-types.ts"

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
