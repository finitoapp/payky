import {
  type Currency,
  Integer,
  NumberString,
} from "@/core/modules/shared/schema.ts"

export type Money = {
  value: Integer
  currency: Currency
}

export const currencyFractionDigits: Record<Currency, Integer> = {
  USD: Integer(2),
  EUR: Integer(2),
  CZK: Integer(2),
  BTC: Integer(8), // We want to present BTC in sats
}

export const minorUnitsToDecimalString = (props: Money): NumberString => {
  const fractionDigits = currencyFractionDigits[props.currency]
  const isNegative = props.value < BigInt(0)
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

export const decimalAmountToMinorUnits = ({
  currency,
  value,
}: {
  readonly currency: Currency
  readonly value: string
}): Integer | null => {
  const normalized = normalizeDecimalSeparators(value.trim())
  const parts = /^(\d+)(?:\.(\d+))?$/u.exec(normalized)
  if (parts === null) return null

  const wholePart = parts[1]
  const fractionPart = parts[2] ?? ""
  if (wholePart === undefined) return null

  const fractionDigits = currencyFractionDigits[currency]
  if (fractionPart.length > fractionDigits) return null

  const minorUnitFactor = 10 ** fractionDigits
  const amount =
    Number(wholePart) * minorUnitFactor +
    Number(fractionPart.padEnd(fractionDigits, "0"))
  if (!Number.isSafeInteger(amount) || amount <= 0) return null

  return Integer(amount)
}
