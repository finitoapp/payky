import { SqliteBoolean } from "@evolu/common"
import type { IndexesConfig } from "@evolu/common/local-first"

import {
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { TaxRateId, TaxRatePercentageSchema } from "./tax-rate-types.ts"

export const taxRate = {
  id: TaxRateId,
  name: NonEmptyString255Schema,
  rate: TaxRatePercentageSchema,
  sortOrder: NonNegativeIntegerSchema,
  isDefault: SqliteBoolean,
  /** Archival timestamp; `null` means the rate is active. See `TaxRatePercentageSchema` for why rates are archived instead of edited or deleted. */
  deactivatedAt: TimestampMsSchema.nullable(),
} as const

export const taxRateIndexes = ((create) => [
  create("taxRate_sortOrder").on("taxRate").column("sortOrder"),
]) satisfies IndexesConfig

export type TaxRateRow = InferTable<typeof taxRate>
