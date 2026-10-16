import { z } from "zod"
import {
  type InferTable,
  NonEmptyString255Schema,
  PositiveIntegerSchema,
} from "../shared/schema.ts"
import { PaymentNumberSeriesId } from "./payment-number-series-types.ts"

export const paymentNumberSeries = {
  id: PaymentNumberSeriesId,
  serialNumberDigits: PositiveIntegerSchema,
  yearFormat: z.enum(["default", "short"]),
  monthFormat: z.enum(["default", "hidden"]),
  dayFormat: z.enum(["default", "hidden"]),
  prefix: NonEmptyString255Schema.nullable(),
} as const

export type PaymentNumberSeriesRow = InferTable<typeof paymentNumberSeries>
