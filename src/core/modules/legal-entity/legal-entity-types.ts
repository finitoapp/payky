import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const LegalEntityIdRaw = id("LegalEntity")
export const LegalEntityId = standardSchemaToZod(LegalEntityIdRaw)
export type LegalEntityId = typeof LegalEntityIdRaw.Output

/** `null` on `legalEntity.country` means "other" (a country outside this enum) once the row exists. */
export const CountryCodeSchema = z.enum(["CZ", "SK"])
export type CountryCode = z.output<typeof CountryCodeSchema>
