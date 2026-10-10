import { createIdFromString } from "@evolu/common"
import { format } from "date-fns"

import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { PaymentNumberRow } from "@/core/modules/payment-number/payment-number.ts"
import type { PaymentNumberSeriesRow } from "@/core/modules/payment-number-series/payment-number-series.ts"
import {
  type DateString,
  DateStringSchema,
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
} from "@/core/modules/shared/schema.ts"

export const paymentLastNumberId = createIdFromString<"PaymentLastNumber">(
  "payky-payment-last-number"
)

export interface PreviousPaymentNumber {
  readonly date: DateString | null
  readonly serialNumber: NonNegativeIntegerType
}

const getNumberingPeriod = (
  date: DateString,
  series: PaymentNumberSeriesRow
): string => {
  if (series.dayFormat !== "hidden") return date
  if (series.monthFormat !== "hidden") return date.slice(0, 7)
  return date.slice(0, 4)
}

export const createPaymentNumberDate = (date: Date): DateString =>
  DateStringSchema.decode(format(date, "yyyy-MM-dd"))

export const createNextPaymentNumberValues = ({
  id,
  date,
  series,
  previous,
}: {
  readonly id: PaymentId
  readonly date: DateString
  readonly series: PaymentNumberSeriesRow
  readonly previous?: PreviousPaymentNumber
}): PaymentNumberRow => {
  const currentPeriod = getNumberingPeriod(date, series)
  const previousPeriod =
    previous?.date === null || previous?.date === undefined
      ? null
      : getNumberingPeriod(previous.date, series)
  const serialNumber = NonNegativeInteger(
    previous !== undefined && previousPeriod === currentPeriod
      ? previous.serialNumber + 1
      : 1
  )

  return {
    id,
    serialNumber,
    date,
  }
}
