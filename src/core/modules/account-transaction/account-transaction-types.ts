import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

const AccountTransactionIdRaw = id("AccountTransaction")
export const AccountTransactionId = standardSchemaToZod(AccountTransactionIdRaw)
export type AccountTransactionId = typeof AccountTransactionIdRaw.Output

const AccountTransactionSourceIdRaw = id("AccountTransactionSource")
export const AccountTransactionSourceId = standardSchemaToZod(
  AccountTransactionSourceIdRaw
)
export type AccountTransactionSourceId =
  typeof AccountTransactionSourceIdRaw.Output
