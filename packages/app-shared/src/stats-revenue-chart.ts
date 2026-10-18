import type { SalesBucket } from "@payky/core/modules/sales-stats/sales-stats-utils"
import { minorUnitsToDecimalString } from "@payky/core/modules/shared/money"
import { type Currency, Integer } from "@payky/core/modules/shared/schema"

export interface RevenueChartPoint {
  /** Local start of the bucket, epoch ms. */
  readonly start: number
  /**
   * Gross sales (tips not included) in major units — the chart's scale, not
   * money to add up. `undefined` for a bucket still ahead of `now`, which
   * has no bar.
   */
  readonly sales: number | undefined
  /** The bucket's tips, stacked on top of `sales`. */
  readonly tips: number | undefined
  /**
   * The comparison bucket at the same position, sales and tips together, if
   * the comparison has one — what the change is figured against.
   */
  readonly previous: number | undefined
  /** `previous` split for its bar, the same way the current bar stacks. */
  readonly previousSales: number | undefined
  readonly previousTips: number | undefined
  readonly previousStart: number | undefined
}

/**
 * The bars and the comparison bars behind them, matched by position: the
 * n-th hour or day of the period against the n-th of its comparison. The
 * comparison covers its whole span, so on *Today* the hours still ahead
 * show only what sold a week earlier.
 */
export const revenueChartPoints = ({
  current,
  previous,
  currency,
  now,
}: {
  readonly current: ReadonlyArray<SalesBucket>
  readonly previous: ReadonlyArray<SalesBucket>
  readonly currency: Currency
  readonly now: Date
}): ReadonlyArray<RevenueChartPoint> => {
  const major = (value: number) =>
    Number(minorUnitsToDecimalString({ value: Integer(value), currency }))
  return current.map((bucket, index) => {
    const comparisonBucket = previous[index]
    const ahead = bucket.start.getTime() > now.getTime()
    return {
      start: bucket.start.getTime(),
      sales: ahead ? undefined : major(bucket.gross),
      tips: ahead ? undefined : major(bucket.tips),
      previous:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.gross + comparisonBucket.tips),
      previousSales:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.gross),
      previousTips:
        comparisonBucket === undefined
          ? undefined
          : major(comparisonBucket.tips),
      previousStart: comparisonBucket?.start.getTime(),
    }
  })
}
