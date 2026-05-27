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

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .brand<"DateString">()
export const NonEmptyStringSchema = z
  .string()
  .trim()
  .min(1)
  .brand<"NonEmptyString">()
export const NonEmptyString255Schema =
  NonEmptyStringSchema.max(255).brand<"NonEmptyString255">()
export const IntegerSchema = z.number().int().brand<"Int">()
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

export const FiatCurrencySchema = z.enum(["CZK"])
export const CurrencySchema = z.enum(["CZK", "BTC"])
export const PaymentMethodSchema = z.enum(["cash", "spark", "bankQr"])
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
export const BillItemTypeSchema = z.enum(["catalogItem", "manualAmount", "tip"])
export const BillItemLineTagSchema = z.enum(["add", "remove"])

export type FiatCurrency = z.output<typeof FiatCurrencySchema>
export type Currency = z.output<typeof CurrencySchema>
export type PaymentMethod = z.output<typeof PaymentMethodSchema>
export type PaymentStatus = z.output<typeof PaymentStatusSchema>
export type BillStatus = z.output<typeof BillStatusSchema>
export type BillItemType = z.output<typeof BillItemTypeSchema>
export type BillItemLineTag = z.output<typeof BillItemLineTagSchema>
export type Integer = z.output<typeof IntegerSchema>
export type FloatString = z.output<typeof NumberStringSchema>
