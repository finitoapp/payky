import { z } from "zod"

export const maxTipPresetCount = 4

export const defaultTipPercentages = [5, 10, 15, 20] as const
export const defaultTipFixedAmounts = [2000, 5000] as const

const hasUniqueValues = (values: ReadonlyArray<number>): boolean =>
  new Set(values).size === values.length

export const TipPercentagesSchema = z
  .array(z.number().int().min(1).max(100))
  .max(maxTipPresetCount)
  .refine(hasUniqueValues, "Tip percentages must be unique.")
export type TipPercentages = z.output<typeof TipPercentagesSchema>

export const TipFixedAmountsSchema = z
  .array(z.number().int().positive())
  .max(maxTipPresetCount)
  .refine(hasUniqueValues, "Tip fixed amounts must be unique.")
export type TipFixedAmounts = z.output<typeof TipFixedAmountsSchema>

const parseTipPreset = <Value>(
  value: string | null | undefined,
  schema: z.ZodType<Value>,
  fallback: Value
): Value => {
  if (value === null || value === undefined) return fallback

  try {
    return schema.parse(JSON.parse(value) as unknown)
  } catch {
    return fallback
  }
}

export const parseTipPercentages = (
  value: string | null | undefined
): TipPercentages =>
  parseTipPreset(value, TipPercentagesSchema, [...defaultTipPercentages])

export const parseTipFixedAmounts = (
  value: string | null | undefined
): TipFixedAmounts =>
  parseTipPreset(value, TipFixedAmountsSchema, [...defaultTipFixedAmounts])

export const stringifyTipPercentages = (
  values: ReadonlyArray<number>
): string => JSON.stringify(TipPercentagesSchema.parse(values))

export const stringifyTipFixedAmounts = (
  values: ReadonlyArray<number>
): string => JSON.stringify(TipFixedAmountsSchema.parse(values))
