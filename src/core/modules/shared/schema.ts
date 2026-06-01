import type { StandardSchemaV1 } from "@evolu/common"
import { z } from "zod"

export type InferTable<T extends Readonly<Record<string, StandardSchemaV1>>> =
  Readonly<{
    [K in keyof T]: StandardSchemaV1.InferOutput<T[K]>
  }>

export const TimestampMsSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<"TimestampMs">()
export type TimestampMs = z.output<typeof TimestampMsSchema>
export const TimestampMs = TimestampMsSchema.decode

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .brand<"DateString">()
export type DateString = z.output<typeof DateStringSchema>
export const NonEmptyStringSchema = z
  .string()
  .trim()
  .min(1)
  .brand<"NonEmptyString">()
export type NonEmptyString = z.output<typeof NonEmptyStringSchema>
export const NonEmptyString255Schema =
  NonEmptyStringSchema.max(255).brand<"NonEmptyString255">()
export type NonEmptyString255 = z.output<typeof NonEmptyString255Schema>
export const NonEmptyString255 = NonEmptyString255Schema.decode

export const HttpsUrlSchema = z
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "URL must use HTTPS.",
  })
  .brand<"HttpsUrl">()

export const SqliteBoolSchema = z.union([z.literal(0), z.literal(1)])

export const BoolToSqliteBoolSchema = z
  .boolean()
  .transform((value) => (value ? 1 : 0))
  .pipe(SqliteBoolSchema)

export const WssUrlSchema = z
  .url({ protocol: /^wss$/ })
  .brand<"NonEmpty", "inout">()
  .brand<"WssUrl", "inout">()
export type WssUrl = z.output<typeof WssUrlSchema>
export const WssUrl = <T extends string>(value: T): WssUrl =>
  WssUrlSchema.parse(value)

export const IntegerSchema = z.number().int().brand<"Int">()
export const Integer = IntegerSchema.decode
export const NonNegativeIntegerSchema =
  IntegerSchema.nonnegative().brand<"NonNegative">()
export type NonNegativeInteger = z.output<typeof NonNegativeIntegerSchema>
export const NonNegativeInteger = NonNegativeIntegerSchema.decode

export const PositiveIntegerSchema =
  NonNegativeIntegerSchema.positive().brand<"Positive">()
export type PositiveInteger = z.output<typeof PositiveIntegerSchema>
export const PositiveInteger = PositiveIntegerSchema.decode

export const NonNegativeNumberSchema = z
  .number()
  .nonnegative()
  .brand<"NonNegative">()
export type NonNegativeNumber = z.output<typeof NonNegativeNumberSchema>
export const NonNegativeNumber = NonNegativeNumberSchema.decode

export const PositiveNumberSchema = z.number().positive().brand<"Positive">()
export type PositiveNumber = z.output<typeof PositiveNumberSchema>
export const PositiveNumber = PositiveNumberSchema.decode

export const IntegerStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)$/)
  .brand<"Int">()
export type IntegerString = z.output<typeof IntegerStringSchema>

export const NumberStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .brand<"Float">()
export type NumberString = z.output<typeof NumberStringSchema>
export const NumberString = NumberStringSchema.decode

export const NumberFromStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .transform((value) => Number(value))
export const NonNegativeNumberFromStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .transform((value) => Number(value) as NonNegativeNumber)
export const PositiveNumberFromStringSchema = z
  .string()
  .regex(/^(?:[1-9]\d*)(?:\.\d+)?$/)
  .transform((value) => Number(value) as PositiveNumber)

export const IntegerFromStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)$/)
  .transform((value) => Number(value) as Integer)

export const NonNegativeIntegerFromStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/)
  .transform((value) => Number(value) as NonNegativeInteger)

export const PositiveIntegerFromStringSchema = z
  .string()
  .regex(/^(?:[1-9]\d*)$/)
  .transform((value) => Number(value) as PositiveInteger)

export type InferEnumType<T extends Record<string, string>> = T[keyof T]

export const FiatCurrency = {
  USD: "USD",
  EUR: "EUR",
  CZK: "CZK",
} as const
export type FiatCurrency = InferEnumType<typeof FiatCurrency>

export const Currency = {
  ...FiatCurrency,
  BTC: "BTC",
} as const
export type Currency = InferEnumType<typeof Currency>

export const FiatCurrencySchema = z.enum(Object.values(FiatCurrency))
export const CurrencySchema = z.enum(Object.values(Currency))
export const AccountKindSchema = z.enum(["iban", "spark", "cashRegister"])
export const PaymentStatusSchema = z.enum([
  "created",
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
])
export const BillStatusSchema = z.enum([
  "open",
  "partiallyPaid",
  "paid",
  "canceled",
])
export const ItemLineTypeSchema = z.enum(["catalogItem", "manualAmount", "tip"])
export const BillLineTagSchema = z.enum(["add", "remove"])
export const IbanSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/u)
  .brand<"Iban">()
export const VariableSymbolSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/u)
  .brand<"VariableSymbol">()
export const ConstantSymbolSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/u)
  .brand<"ConstantSymbol">()
export const SpecificSymbolSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/u)
  .brand<"SpecificSymbol">()

export type AccountKind = z.output<typeof AccountKindSchema>
export type PaymentStatus = z.output<typeof PaymentStatusSchema>
export type BillStatus = z.output<typeof BillStatusSchema>
export type ItemLineType = z.output<typeof ItemLineTypeSchema>
export type BillLineTag = z.output<typeof BillLineTagSchema>
export type Integer = z.output<typeof IntegerSchema>
export type FloatString = z.output<typeof NumberStringSchema>
export type Iban = z.output<typeof IbanSchema>
export type VariableSymbol = z.output<typeof VariableSymbolSchema>
export type ConstantSymbol = z.output<typeof ConstantSymbolSchema>
export type SpecificSymbol = z.output<typeof SpecificSymbolSchema>
