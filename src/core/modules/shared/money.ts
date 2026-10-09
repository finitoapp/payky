import {
  type Currency,
  type FiatCurrency,
  Integer,
  NumberString,
} from "@/core/modules/shared/schema.ts"

export type Money = {
  readonly value: Integer
  readonly currency: Currency
}

export const currencyFractionDigits: Record<Currency, Integer> = {
  USD: Integer(2),
  EUR: Integer(2),
  CZK: Integer(2),
  BTC: Integer(8), // We want to present BTC in sats
}

export const minorUnitsToDecimalString = (props: Money): NumberString => {
  const fractionDigits = currencyFractionDigits[props.currency]
  const isNegative = props.value < 0
  const abs = isNegative ? -props.value : props.value

  if (fractionDigits === 0) {
    const result = abs.toString()
    return NumberString(isNegative && result !== "0" ? `-${result}` : result)
  }

  const text = abs.toString().padStart(fractionDigits + 1, "0")
  const integerPart = text.slice(0, -fractionDigits).replace(/^0+(?=\d)/, "")
  const fractionPart = text.slice(-fractionDigits).replace(/0+$/, "")
  const base =
    fractionPart === "" ? integerPart : `${integerPart}.${fractionPart}`

  return NumberString(isNegative && base !== "0" ? `-${base}` : base)
}

export const minorUnitsToFixedDecimalString = (props: Money): NumberString => {
  const fractionDigits = currencyFractionDigits[props.currency]
  const digits = Math.abs(props.value)
    .toString()
    .padStart(fractionDigits + 1, "0")
  const integerPart = digits.slice(0, digits.length - fractionDigits)
  const fractionPart = digits.slice(digits.length - fractionDigits)
  const base =
    fractionDigits === 0 ? integerPart : `${integerPart}.${fractionPart}`

  return NumberString(props.value < 0 ? `-${base}` : base)
}

/**
 * Normalizes a decimal string that may use either "." or "," as the decimal
 * separator, possibly with the other character used as a thousands grouping
 * (e.g. "1,234.56" or "1.234,56"). The separator closest to the end of the
 * string is treated as the decimal point; any earlier "." or "," are
 * grouping characters and are stripped.
 */
const normalizeDecimalSeparators = (value: string): string => {
  const lastComma = value.lastIndexOf(",")
  const lastDot = value.lastIndexOf(".")
  const decimalSeparatorIndex = Math.max(lastComma, lastDot)

  if (decimalSeparatorIndex === -1) {
    return value
  }

  const integerPart = value
    .slice(0, decimalSeparatorIndex)
    .replaceAll(/[.,]/gu, "")
  const fractionPart = value.slice(decimalSeparatorIndex + 1)

  return `${integerPart}.${fractionPart}`
}

/**
 * A decimal with "." as its only separator to minor units, or `null` when it
 * is not one or carries more fraction digits than `currency` has.
 */
const decimalToMinorUnits = (
  currency: Currency,
  value: string
): number | null => {
  const parts = /^(\d+)(?:\.(\d*))?$/u.exec(value)
  if (parts === null) return null

  const wholePart = parts[1]
  const fractionPart = parts[2] ?? ""
  if (wholePart === undefined) return null

  const fractionDigits = currencyFractionDigits[currency]
  if (fractionPart.length > fractionDigits) return null

  const amount =
    Number(wholePart) * 10 ** fractionDigits +
    Number(fractionPart.padEnd(fractionDigits, "0"))
  return Number.isSafeInteger(amount) ? amount : null
}

export const decimalAmountToMinorUnits = ({
  currency,
  value,
}: {
  readonly currency: Currency
  readonly value: string
}): Integer | null => {
  const amount = decimalToMinorUnits(
    currency,
    normalizeDecimalSeparators(value.trim())
  )
  if (amount === null || amount <= 0) return null

  return Integer(amount)
}

/**
 * A machine-formatted amount, such as a bank statement's, to minor units.
 * Unlike `decimalAmountToMinorUnits`, which reads what a person typed, it
 * keeps the sign (an outgoing movement is negative) and zero, and accepts no
 * thousands grouping: one "." or "," decimal separator at most, so a grouped
 * or otherwise ambiguous value is refused rather than guessed at. A JSON
 * number is first rounded to the currency's fraction digits.
 */
export const signedDecimalAmountToMinorUnits = ({
  currency,
  value,
}: {
  readonly currency: Currency
  readonly value: string | number
}): Integer | null => {
  const text =
    typeof value === "number"
      ? value.toFixed(currencyFractionDigits[currency])
      : value.trim().replace(",", ".")
  const isNegative = text.startsWith("-")
  const amount = decimalToMinorUnits(
    currency,
    isNegative ? text.slice(1) : text
  )
  if (amount === null) return null

  return Integer(isNegative && amount !== 0 ? -amount : amount)
}

export const SATS_PER_BTC = 100_000_000

/**
 * A fiat amount in minor units to satoshis at `exchangeRate` (fiat per BTC).
 *
 * Floored at one sat. One minor unit is worth a fraction of a sat at any
 * realistic rate, so without the floor the smallest chargeable amount rounds
 * down to zero and produces an amountless invoice — which a wallet reads as
 * "payer picks the amount", not as the price. A positive `amount` is the
 * caller's precondition; `createSparkLightningInvoice` refuses zero before
 * reaching here.
 */
export const fiatMinorUnitsToSats = ({
  amount,
  exchangeRate,
  currency,
}: {
  readonly amount: number
  readonly exchangeRate: number
  readonly currency: FiatCurrency
}): number =>
  fiatToSats({
    fiatAmount: amount / 10 ** currencyFractionDigits[currency],
    exchangeRate,
  })

/**
 * A fiat amount in whole units to satoshis at `exchangeRate` (fiat per BTC).
 * Same floor, and the same reason, as `fiatMinorUnitsToSats`.
 */
export const fiatToSats = ({
  fiatAmount,
  exchangeRate,
}: {
  readonly fiatAmount: number
  readonly exchangeRate: number
}): number =>
  Math.max(1, Math.round((fiatAmount / exchangeRate) * SATS_PER_BTC))

/**
 * Satoshis back to a fiat amount in whole units at `exchangeRate`. The
 * inverse of `fiatToSats` up to its rounding, so round-tripping a small
 * amount does not land back on the value it started from.
 */
export const satsToFiat = ({
  sats,
  exchangeRate,
}: {
  readonly sats: number
  readonly exchangeRate: number
}): number => (sats / SATS_PER_BTC) * exchangeRate

/**
 * ISO 4217 numeric currency codes, required by payment terminals that speak
 * the numeric form of the standard rather than the alphabetic one (Switchio
 * Pay's ECR protocol, for example).
 */
export const currencyNumericCodes = {
  USD: 840,
  EUR: 978,
  CZK: 203,
} as const satisfies Record<FiatCurrency, number>
