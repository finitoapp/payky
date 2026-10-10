import { DateIso } from "@evolu/common"
import {
  addDays,
  addHours,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"

import {
  calculateTaxRecap,
  type TaxRecapRow,
} from "@/core/modules/bill-line/bill-line-tax-utils.ts"
import {
  type Currency,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import type { TaxRateRow } from "@/core/modules/tax-rate/tax-rate.ts"
import type {
  RefundsRow,
  SalesByHourRow,
  SalesByMethodRow,
  TaxRecapQueryRow,
} from "./sales-stats-queries.ts"
import type { StatsPeriod, StatsRange } from "./sales-stats-types.ts"

const toRange = (from: Date, to: Date): StatsRange => ({
  fromIso: DateIso.orThrow(from.toISOString()),
  toIso: DateIso.orThrow(to.toISOString()),
})

export interface StatsPeriodRanges {
  readonly range: StatsRange
  /** The previous period of the same shape, for every figure's change. */
  readonly comparison: StatsRange
  /** Chart bars: per hour for a one-day period, per day otherwise. */
  readonly bucket: "hour" | "day"
}

/**
 * A period's local-calendar range and the one it compares with. A business
 * day ends at local midnight; a period that includes today runs to the end
 * of it. *Today* and *Yesterday* compare with the same weekday a week earlier,
 * *7 days* with the 7 days before, *Month* with the same day span of the
 * previous month (`subMonths`), *Custom* with the equally long span right
 * before it. Custom spans are not capped.
 *
 * The two "to date" presets, *Today* and *Month*, compare like for like: the
 * comparison stops at the equivalent of `now` (a week or a month earlier),
 * not at the end of that day, or every morning would show a steep drop
 * against a whole finished day. The others compare whole spans.
 */
export const statsPeriodRanges = (
  period: StatsPeriod,
  now: Date
): StatsPeriodRanges => {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const weekBefore = (from: Date, to: Date): StatsPeriodRanges => ({
    range: toRange(from, to),
    comparison: toRange(subDays(from, 7), subDays(to, 7)),
    bucket: differenceInCalendarDays(to, from) === 1 ? "hour" : "day",
  })

  switch (period.kind) {
    case "today":
      return {
        ...weekBefore(today, tomorrow),
        comparison: toRange(subDays(today, 7), subDays(now, 7)),
      }
    case "yesterday":
      return weekBefore(subDays(today, 1), today)
    case "last7Days":
      return weekBefore(subDays(today, 6), tomorrow)
    case "monthToDate": {
      const from = startOfMonth(now)
      return {
        range: toRange(from, tomorrow),
        comparison: toRange(subMonths(from, 1), subMonths(now, 1)),
        bucket: "day",
      }
    }
    case "custom": {
      const from = parseISO(period.from)
      const to = addDays(parseISO(period.to), 1)
      const days = differenceInCalendarDays(to, from)
      return {
        range: toRange(from, to),
        comparison: toRange(subDays(from, days), from),
        bucket: days === 1 ? "hour" : "day",
      }
    }
  }
}

/**
 * The instant a `salesByHourQuery` UTC hour (`yyyy-MM-ddTHH`) starts.
 *
 * ponytail: SQL buckets by whole UTC hours, which maps exactly onto local
 * hours only for whole-hour offsets — all of CZ/SK. A half-hour time zone
 * would need 30-minute buckets in `salesByHourQuery`.
 */
export const utcHourToDate = (utcHour: string): Date =>
  new Date(`${utcHour}:00:00.000Z`)

export interface SalesTotals {
  readonly count: number
  readonly gross: number
  readonly tips: number
}

export interface SalesBucket extends SalesTotals {
  /** Local start of the hour or day. */
  readonly start: Date
}

const emptyTotals: SalesTotals = { count: 0, gross: 0, tips: 0 }

const addTotals = (a: SalesTotals, b: SalesTotals): SalesTotals => ({
  count: a.count + b.count,
  gross: a.gross + b.gross,
  tips: a.tips + b.tips,
})

/**
 * One currency's hourly rows as chart buckets over the whole range, empty
 * ones filled with zeros. Hours step by the clock, not the wall: a spring
 * DST day has 23 hourly buckets and an autumn one 25. A range ending
 * mid-hour or mid-day (*Today*'s comparison, which stops at the same time a
 * week earlier) keeps its last, partial bucket.
 */
export const salesBuckets = ({
  rows,
  currency,
  range,
  unit,
}: {
  readonly rows: ReadonlyArray<SalesByHourRow>
  readonly currency: Currency
  readonly range: StatsRange
  readonly unit: "hour" | "day"
}): ReadonlyArray<SalesBucket> => {
  const from = new Date(range.fromIso)
  const to = new Date(range.toIso)
  const keyOf = (date: Date) =>
    unit === "hour" ? date.toISOString() : format(date, "yyyy-MM-dd")

  const totalsByKey = new Map<string, SalesTotals>()
  for (const row of rows) {
    if (row.currency !== currency) continue
    const key = keyOf(utcHourToDate(row.utcHour))
    totalsByKey.set(key, addTotals(totalsByKey.get(key) ?? emptyTotals, row))
  }

  const starts =
    unit === "hour"
      ? Array.from(
          { length: Math.ceil((to.getTime() - from.getTime()) / 3_600_000) },
          (_, index) => addHours(from, index)
        )
      : eachDayOfInterval({ start: from, end: new Date(to.getTime() - 1) })

  return starts.map((start) => ({
    start,
    ...(totalsByKey.get(keyOf(start)) ?? emptyTotals),
  }))
}

/**
 * One currency's sales as a 7 × 24 matrix, Monday first, by local weekday
 * and hour. The autumn DST day's repeated hour lands in the same cell.
 */
export const salesHeatmap = (
  rows: ReadonlyArray<SalesByHourRow>,
  currency: Currency
): ReadonlyArray<ReadonlyArray<SalesTotals>> => {
  const matrix = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => emptyTotals)
  )
  for (const row of rows) {
    if (row.currency !== currency) continue
    const date = utcHourToDate(row.utcHour)
    const weekday = matrix[(date.getDay() + 6) % 7]
    const cell = weekday?.[date.getHours()]
    if (weekday === undefined || cell === undefined) continue
    weekday[date.getHours()] = addTotals(cell, row)
  }
  return matrix
}

export interface StatsDelta {
  readonly difference: number
  /** `null` when there is nothing to compare with. */
  readonly ratio: number | null
}

export const statsDelta = (current: number, previous: number): StatsDelta => ({
  difference: current - previous,
  ratio: previous === 0 ? null : (current - previous) / previous,
})

/** The currencies in the period, the account currency first. */
export const orderCurrencies = (
  currencies: Iterable<Currency>,
  accountCurrency: Currency
): ReadonlyArray<Currency> =>
  [...new Set(currencies)].sort((a, b) =>
    a === accountCurrency ? -1 : b === accountCurrency ? 1 : a.localeCompare(b)
  )

export interface SalesKpis {
  readonly currency: Currency
  /** Gross of paid payments minus non-tip refunds paid out in the period. */
  readonly netRevenue: number
  /** Paid payments without their tips, before refunds. */
  readonly gross: number
  readonly salesCount: number
  /** Gross per sale, refunds not subtracted; 0 without sales. */
  readonly averageSale: number
  /** Tips minus tip refunds. */
  readonly tips: number
  readonly refundCount: number
  readonly refundAmount: number
}

/** The KPI tiles, one set per currency, the account currency first. */
export const salesKpis = ({
  hourRows,
  refundRows,
  accountCurrency,
}: {
  readonly hourRows: ReadonlyArray<SalesByHourRow>
  readonly refundRows: ReadonlyArray<RefundsRow>
  readonly accountCurrency: Currency
}): ReadonlyArray<SalesKpis> =>
  orderCurrencies(
    [...hourRows, ...refundRows].map((row) => row.currency),
    accountCurrency
  ).map((currency) => {
    const sales = hourRows
      .filter((row) => row.currency === currency)
      .reduce(addTotals, emptyTotals)
    const refunds = refundRows.filter((row) => row.currency === currency)
    const refundSum = (isTip: 0 | 1) =>
      refunds
        .filter((row) => row.isTip === isTip)
        .reduce((sum, row) => sum + row.amount, 0)

    return {
      currency,
      netRevenue: sales.gross - refundSum(0),
      gross: sales.gross,
      salesCount: sales.count,
      averageSale:
        sales.count === 0 ? 0 : Math.round(sales.gross / sales.count),
      tips: sales.tips - refundSum(1),
      refundCount: refunds.reduce((sum, row) => sum + row.count, 0),
      refundAmount: refunds.reduce((sum, row) => sum + row.amount, 0),
    }
  })

export interface MethodShare {
  readonly method: SalesByMethodRow["method"]
  readonly count: number
  readonly amount: number
  /** Of the methods' total, 0..1. */
  readonly share: number
}

export interface MethodBreakdown {
  readonly currency: Currency
  readonly methods: ReadonlyArray<MethodShare>
  readonly total: number
  /**
   * How far the methods exceed gross sales — a duplicate settlement's
   * second payment, real money the footnote names. 0 normally.
   */
  readonly excess: number
}

export const methodBreakdown = ({
  methodRows,
  hourRows,
  accountCurrency,
}: {
  readonly methodRows: ReadonlyArray<SalesByMethodRow>
  readonly hourRows: ReadonlyArray<SalesByHourRow>
  readonly accountCurrency: Currency
}): ReadonlyArray<MethodBreakdown> =>
  orderCurrencies(
    methodRows.map((row) => row.currency),
    accountCurrency
  ).map((currency) => {
    const rows = methodRows.filter((row) => row.currency === currency)
    const total = rows.reduce((sum, row) => sum + row.amount, 0)
    const gross = hourRows
      .filter((row) => row.currency === currency)
      .reduce((sum, row) => sum + row.gross, 0)
    return {
      currency,
      methods: rows
        .map((row) => ({
          method: row.method,
          count: row.count,
          amount: row.amount,
          share: total === 0 ? 0 : row.amount / total,
        }))
        .sort((a, b) => b.amount - a.amount),
      total,
      excess: Math.max(0, total - gross),
    }
  })

export interface ExpectedCash {
  readonly currency: Currency
  /** Cash taken for the period's paid payments, tips included. */
  readonly cashIn: number
  /** The tips inside `cashIn`, for staff who pool them. */
  readonly cashTips: number
  readonly cashRefunds: number
  /** The drawer's movement: `cashIn - cashRefunds`. No opening float. */
  readonly expected: number
}

/** Expected cash per currency that had any cash movement in the period. */
export const expectedCash = ({
  methodRows,
  refundRows,
  accountCurrency,
}: {
  readonly methodRows: ReadonlyArray<SalesByMethodRow>
  readonly refundRows: ReadonlyArray<RefundsRow>
  readonly accountCurrency: Currency
}): ReadonlyArray<ExpectedCash> => {
  const cashRows = methodRows.filter((row) => row.method === "cashRegister")
  const cashRefundRows = refundRows.filter(
    (row) => row.method === "cashRegister"
  )
  return orderCurrencies(
    [...cashRows, ...cashRefundRows].map((row) => row.currency),
    accountCurrency
  ).map((currency) => {
    const cash = cashRows.filter((row) => row.currency === currency)
    const cashIn = cash.reduce((sum, row) => sum + row.claimedAmount, 0)
    const cashRefunds = cashRefundRows
      .filter((row) => row.currency === currency)
      .reduce((sum, row) => sum + row.amount, 0)
    return {
      currency,
      cashIn,
      // ponytail: a tip on a payment settled by several claims is not
      // attributed to any one method, so it is missing here; split it
      // pro rata if pooled tips ever need it.
      cashTips: cash.reduce((sum, row) => sum + row.tips, 0),
      cashRefunds,
      expected: cashIn - cashRefunds,
    }
  })
}

/**
 * `TaxRecap`'s rows for one currency, through `calculateTaxRecap` itself so
 * VAT is rounded per line exactly as on a bill. `rates` is
 * `taxRatesQuery`, archived rates included: old bills point at them.
 *
 * ponytail: expands the per-amount counts back into one entry per line —
 * ~30 k a month, a few ms. Multiply the split per amount if a year-long
 * range ever shows it.
 */
export const salesTaxRecap = ({
  rows,
  currency,
  rates,
}: {
  readonly rows: ReadonlyArray<TaxRecapQueryRow>
  readonly currency: Currency
  readonly rates: ReadonlyArray<Pick<TaxRateRow, "id" | "name" | "rate">>
}): ReadonlyArray<TaxRecapRow> =>
  calculateTaxRecap(
    rows
      .filter((row) => row.currency === currency)
      .flatMap((row) =>
        Array.from({ length: row.lineCount }, () => ({
          taxRateId: row.taxRateId,
          totalAmount: NonNegativeInteger(row.lineAmount),
        }))
      ),
    rates
  )
