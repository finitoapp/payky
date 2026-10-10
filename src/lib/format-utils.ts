import { differenceInCalendarDays } from "date-fns"
import {
  currencyFractionDigits,
  type Money,
  minorUnitsToDecimalString,
  SATS_PER_BTC,
} from "@/core/modules/shared/money.ts"
import type { Currency } from "@/core/modules/shared/schema.ts"

export function formatAmount(
  amount: number,
  currency?: Currency | undefined,
  locale: string = "en-US"
) {
  if (currency === "BTC") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currencyDisplay: "code",
      currency: "USD", // Use USD as base but replace symbol
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(amount * SATS_PER_BTC)
      .replace("USD", "Sats")
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(currency === undefined
        ? {}
        : { minimumFractionDigits: currencyFractionDigits[currency] }),
    }).format(amount)
  } catch (_error) {
    return `${amount.toLocaleString()}${currency ? ` ${currency}` : ""}`
  }
}

export function formatMoney(money: Money, locale: string = "en-US") {
  const value = minorUnitsToDecimalString(money)
  return formatAmount(Number(value), money.currency, locale)
}

export const formatDate = (value: Date, locale: string = "en-US") =>
  value.toLocaleDateString(locale, {
    dateStyle: "medium",
  })

/**
 * A day heading: "Today"/"Yesterday" in the locale's own words for the two
 * most recent days, `formatDate` for anything older (or in the future).
 */
export const formatRelativeDate = (
  value: Date,
  now: Date,
  locale: string = "en-US"
) => {
  const days = differenceInCalendarDays(value, now)
  if (days < -1 || days > 0) return formatDate(value, locale)

  const label = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  }).format(days, "day")
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}

export const formatDateTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleString(locale, {
    timeStyle: "short",
    dateStyle: "medium",
  })

export const formatTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleTimeString(locale, {
    timeStyle: "short",
  })

/**
 * How long something has been going on, at minute resolution: "42 min",
 * "1 hr 5 min". Two unit formats joined rather than `Intl.DurationFormat`,
 * which older Android WebViews don't ship.
 */
export const formatElapsed = (ms: number, locale: string = "en-US") => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const unit = (value: number, unit: "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "short",
    }).format(value)

  if (minutes < 60) return unit(minutes, "minute")
  const hours = unit(Math.floor(minutes / 60), "hour")
  return minutes % 60 === 0 ? hours : `${hours} ${unit(minutes % 60, "minute")}`
}

/** A satoshi amount with the locale's digit grouping, and no currency label. */
export const formatSatsAmount = (sats: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(sats)

/**
 * Groups a long identifier into blocks of four for review — a bitcoin
 * address or an IBAN. Casing is preserved: Base58 addresses are
 * case-sensitive, so lowercasing here would show the user a string that is
 * not the one being paid.
 */
export const formatAddressGroups = (address: string): string =>
  address.replaceAll(/\s+/gu, "").replaceAll(/(.{4})(?=.)/gu, "$1 ")

/**
 * A countdown's time left, as `m:ss`, or `h:mm:ss` from an hour up. Seconds
 * round up, so it shows 0:01 until the time is really out, never 0:00 early.
 */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

/**
 * `value` with its middle cut to an ellipsis, keeping `head` characters at
 * the start and `tail` at the end, for ids and addresses in a label. Left
 * whole when cutting would not make it shorter.
 */
export const shortenMiddle = (
  value: string,
  head: number,
  tail: number
): string =>
  value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`
