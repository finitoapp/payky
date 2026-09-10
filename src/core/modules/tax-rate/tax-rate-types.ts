import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const TaxRateIdRaw = id("TaxRate")
export const TaxRateId = standardSchemaToZod(TaxRateIdRaw)
export type TaxRateId = typeof TaxRateIdRaw.Output

/**
 * A tax rate's percentage, stored as hundredths of a percent so decimal
 * rates (e.g. 12.5%) don't need floats: 2100 = 21.00%, 1250 = 12.50%.
 * Immutable once a `taxRate` row is created — see `tax-rate-actions.ts`,
 * which exposes no action to change it. A real-world rate change (new
 * legislation) is a new `taxRate` row plus archiving the old one, not an
 * edit, so anything referencing a `taxRateId` stays frozen forever.
 */
export const TaxRatePercentageSchema = z
  .number()
  .int()
  .min(0)
  .max(10000)
  .brand<"TaxRatePercentage">()
export type TaxRatePercentage = z.output<typeof TaxRatePercentageSchema>
export const TaxRatePercentage = TaxRatePercentageSchema.decode
