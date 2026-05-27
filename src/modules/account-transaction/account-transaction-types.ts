import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AccountTransactionIdRaw = id("AccountTransaction")
export const AccountTransactionId = standardSchemaToZod(AccountTransactionIdRaw)
export type AccountTransactionId = typeof AccountTransactionIdRaw.Type
