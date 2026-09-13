import {
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
      minimumFractionDigits: 2,
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

export const formatDateTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleString(locale, {
    timeStyle: "short",
    dateStyle: "medium",
  })

export const formatTime = (value: Date, locale: string = "en-US") =>
  value.toLocaleTimeString(locale, {
    timeStyle: "short",
  })

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
