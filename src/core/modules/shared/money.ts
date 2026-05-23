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
