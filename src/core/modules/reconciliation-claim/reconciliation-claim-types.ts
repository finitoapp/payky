import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const ReconciliationClaimIdRaw = id("ReconciliationClaim")
export const ReconciliationClaimId = standardSchemaToZod(
  ReconciliationClaimIdRaw
)
export type ReconciliationClaimId = typeof ReconciliationClaimIdRaw.Type
