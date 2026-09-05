import { sqliteFalse, sqliteTrue } from "@evolu/common"
import { z } from "zod"

import { CountryCodeSchema } from "@/core/modules/legal-entity/legal-entity-types.ts"
import type { InferTable } from "@/core/modules/shared/schema.ts"
import { LegalEntityId } from "./legal-entity-types.ts"

/**
 * Singleton row (like `appSettings`) carrying the tenant's country and
 * VAT-payer status. Both fields are nullable: an account that hasn't gone
 * through the onboarding country step, or that explicitly declined it, has
 * no row (or a row with null fields) rather than a forced default. A null
 * `vatPayer` is treated the same as `false` (not a VAT payer) everywhere —
 * see `isVatPayer` in `legal-entity-utils.ts`.
 */
export const legalEntity = {
  id: LegalEntityId,
  country: CountryCodeSchema.nullable(),
  vatPayer: z.union([z.literal(sqliteTrue), z.literal(sqliteFalse)]).nullable(),
} as const

export type LegalEntityRow = InferTable<typeof legalEntity>
