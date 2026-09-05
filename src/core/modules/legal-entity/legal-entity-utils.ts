import { createIdFromString, sqliteTrue } from "@evolu/common"

import type { LegalEntityRow } from "./legal-entity.ts"

export const legalEntityId =
  createIdFromString<"LegalEntity">("payky-legal-entity")

export const createDefaultLegalEntity = (): LegalEntityRow => ({
  id: legalEntityId,
  country: null,
  vatPayer: null,
})

/** A null `vatPayer` (never configured) is treated the same as `false`. */
export const isVatPayer = (
  entity: Pick<LegalEntityRow, "vatPayer"> | undefined
): boolean => entity?.vatPayer === sqliteTrue
