import { z } from "zod"

import { PaymentNumberSeriesId } from "@/modules/payment-number-series/payment-number-series-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  PositiveIntegerSchema,
} from "@/modules/shared/schema.ts"

export const paymentNumberSeries = {
  id: PaymentNumberSeriesId,
  serialNumberDigits: PositiveIntegerSchema,
  yearFormat: z.enum(["default", "short"]),
  monthFormat: z.enum(["default", "hidden"]),
  dayFormat: z.enum(["default", "hidden"]),
  prefix: NonEmptyString255Schema.nullable(),
} as const

export type PaymentNumberSeriesRow = InferTable<typeof paymentNumberSeries>
