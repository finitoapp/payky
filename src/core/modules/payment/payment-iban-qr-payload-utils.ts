import { type Version as PayBySquareVersion, Version } from "bysquare"
import {
  encode,
  type Payment as PayBySquarePayment,
  PaymentOptions,
} from "bysquare/pay"

import {
  type BankQrFormat,
  type NonEmptyString,
  NonEmptyStringSchema,
  type SpecificSymbol,
  type VariableSymbol,
} from "@/core/modules/shared/schema.ts"

const FIAT_MINOR_UNITS = 100

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

const formatFiatMinorUnits = (amount: number): string => {
  const major = Math.trunc(amount / FIAT_MINOR_UNITS)
  const minor = String(amount % FIAT_MINOR_UNITS).padStart(2, "0")
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
  readonly currency: string
  readonly specificSymbol: SpecificSymbol | null
  readonly variableSymbol: VariableSymbol | null
}): NonEmptyString =>
  NonEmptyStringSchema.decode(
    [
      "SPD",
      "1.0",
      `ACC:${iban}`,
      `AM:${formatFiatMinorUnits(amount)}`,
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
  readonly currency: string
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
            amount: Number(formatFiatMinorUnits(amount)),
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

export const createBankQrPayload = ({
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
  readonly currency: string
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
