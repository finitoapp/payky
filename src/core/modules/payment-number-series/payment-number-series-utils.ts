import { createIdFromString } from "@evolu/common"

import type { PaymentNumberSeriesRow } from "@/core/modules/payment-number-series/payment-number-series.ts"
import { PositiveInteger } from "@/core/modules/shared/schema.ts"

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
