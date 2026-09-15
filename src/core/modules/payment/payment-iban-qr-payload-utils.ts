import { type Version as PayBySquareVersion, Version } from "bysquare"
import {
  encode,
  type Payment as PayBySquarePayment,
  PaymentOptions,
} from "bysquare/pay"

import { currencyFractionDigits } from "@/core/modules/shared/money.ts"
import {
  type BankQrFormat,
  type Currency,
  type NonEmptyString,
  NonEmptyStringSchema,
  type SpecificSymbol,
  type VariableSymbol,
} from "@/core/modules/shared/schema.ts"

export interface BankQrPayload {
  readonly format: BankQrFormat
  readonly payload: NonEmptyString
}

export const bankQrFormats = [
  "spayd",
  "payBySquare1_0_0",
  "payBySquare1_2_0",
] as const satisfies ReadonlyArray<BankQrFormat>

export const isBankQrFormat = (
  value: string | undefined
): value is BankQrFormat =>
  value !== undefined &&
  (bankQrFormats as ReadonlyArray<string>).includes(value)

/**
 * Minor units to the fixed-width decimal both QR formats carry, with the
 * currency's own fraction digits rather than an assumed two — a zero-decimal
 * currency would otherwise be encoded 100x too small in a real payment QR.
 *
 * Not `minorUnitsToDecimalString`: that one strips trailing zeros, which would
 * turn every whole-crown bill's `AM:129.00` into `AM:129`. Both are valid
 * SPAYD, but it is not a change worth making to a payload that is already in
 * the field and read by other people's scanners.
 */
const formatMinorUnits = (amount: number, currency: Currency): string => {
  const fractionDigits = currencyFractionDigits[currency]

  if (fractionDigits === 0) {
    return String(amount)
  }

  const minorUnits = 10 ** fractionDigits
  const major = Math.trunc(amount / minorUnits)
  const minor = String(amount % minorUnits).padStart(fractionDigits, "0")

  return `${major}.${minor}`
}

const createSpaydQrPayload = ({
  iban,
  amount,
  currency,
  specificSymbol,
  variableSymbol,
}: {
  readonly iban: string
  readonly amount: number
  readonly currency: Currency
  readonly specificSymbol: SpecificSymbol | null
  readonly variableSymbol: VariableSymbol | null
}): NonEmptyString =>
  NonEmptyStringSchema.decode(
    [
      "SPD",
      "1.0",
      `ACC:${iban}`,
      `AM:${formatMinorUnits(amount, currency)}`,
      `CC:${currency}`,
      "PT:IP",
      variableSymbol ? `X-VS:${variableSymbol}` : null,
      specificSymbol ? `X-SS:${specificSymbol}` : null,
    ]
      .filter((part) => part !== null)
      .join("*")
  )

const createPayBySquareQrPayload = ({
  beneficiaryName,
  iban,
  amount,
  currency,
  specificSymbol,
  variableSymbol,
  version,
}: {
  readonly beneficiaryName: string
  readonly iban: string
  readonly amount: number
  readonly currency: Currency
  readonly specificSymbol: SpecificSymbol | null
  readonly variableSymbol: VariableSymbol | null
  readonly version: PayBySquareVersion
}): NonEmptyString =>
  NonEmptyStringSchema.decode(
    encode(
      {
        payments: [
          {
            type: PaymentOptions.PaymentOrder,
            amount: Number(formatMinorUnits(amount, currency)),
            currencyCode: currency,
            beneficiary: { name: beneficiaryName },
            bankAccounts: [{ iban }],
            ...(variableSymbol ? { variableSymbol } : {}),
            ...(specificSymbol ? { specificSymbol } : {}),
          } satisfies PayBySquarePayment,
        ],
      },
      { version }
    )
  )

const createBankQrPayload = ({
  beneficiaryName,
  format,
  iban,
  amount,
  currency,
  specificSymbol,
  variableSymbol,
}: {
  readonly beneficiaryName: string
  readonly format: BankQrFormat
  readonly iban: string
  readonly amount: number
  readonly currency: Currency
  readonly specificSymbol: SpecificSymbol | null
  readonly variableSymbol: VariableSymbol | null
}): NonEmptyString =>
  format === "spayd"
    ? createSpaydQrPayload({
        iban,
        amount,
        currency,
        specificSymbol,
        variableSymbol,
      })
    : createPayBySquareQrPayload({
        beneficiaryName,
        iban,
        amount,
        currency,
        specificSymbol,
        variableSymbol,
        version:
          format === "payBySquare1_0_0" ? Version["1.0.0"] : Version["1.1.0"],
      })

export const createBankQrPayloads = (
  input: Omit<Parameters<typeof createBankQrPayload>[0], "format">
): ReadonlyArray<BankQrPayload> =>
  bankQrFormats.map((format) => ({
    format,
    payload: createBankQrPayload({
      ...input,
      format,
    }),
  }))
