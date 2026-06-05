import type { IndexesConfig } from "@evolu/common/local-first"

import { PaymentId } from "@/core/modules/payment/payment-types.ts"
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

export const paymentNumberIndexes = ((create) => [
  create("paymentNumber_date_serialNumber")
    .on("paymentNumber")
    .columns(["date", "serialNumber"]),
]) satisfies IndexesConfig

export type PaymentNumberRow = InferTable<typeof paymentNumber>
