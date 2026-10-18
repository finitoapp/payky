import { paymentNumberSeries } from "@payky/core/modules/payment-number-series/payment-number-series"
import { expect, test } from "vitest"
import {
  dayFormatOptions,
  monthFormatOptions,
  yearFormatOptions,
} from "./payment-number-series-options.ts"

test("each toggle offers exactly the values the series row accepts", () => {
  const values = (options: ReadonlyArray<{ readonly value: string }>) =>
    options.map((option) => option.value).sort()
  expect(values(yearFormatOptions)).toEqual(
    [...paymentNumberSeries.yearFormat.options].sort()
  )
  expect(values(monthFormatOptions)).toEqual(
    [...paymentNumberSeries.monthFormat.options].sort()
  )
  expect(values(dayFormatOptions)).toEqual(
    [...paymentNumberSeries.dayFormat.options].sort()
  )
})
