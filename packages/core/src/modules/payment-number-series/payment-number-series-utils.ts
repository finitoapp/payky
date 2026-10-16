import { createIdFromString } from "@evolu/common"
import { PositiveInteger } from "../shared/schema.ts"
import type { PaymentNumberSeriesRow } from "./payment-number-series.ts"

export const paymentNumberSeriesId = createIdFromString<"PaymentNumberSeries">(
  "payky-payment-number-series"
)

export const createDefaultPaymentNumberSeries = (): PaymentNumberSeriesRow => ({
  id: paymentNumberSeriesId,
  serialNumberDigits: PositiveInteger(6),
  yearFormat: "default",
  monthFormat: "default",
  dayFormat: "default",
  prefix: null,
})
