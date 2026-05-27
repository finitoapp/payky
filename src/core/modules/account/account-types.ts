import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AccountIdRaw = id("Account")
export const AccountId = standardSchemaToZod(AccountIdRaw)
export type AccountId = typeof AccountIdRaw.Type
