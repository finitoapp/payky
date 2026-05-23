import { id } from "@evolu/common"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AccountTransactionIdRaw = id("AccountTransaction")
export const AccountTransactionId = standardSchemaToZod(AccountTransactionIdRaw)
export type AccountTransactionId = typeof AccountTransactionIdRaw.Type

export const AccountTransactionSourceIdRaw = id("AccountTransactionSource")
export const AccountTransactionSourceId = standardSchemaToZod(
  AccountTransactionSourceIdRaw
)
export type AccountTransactionSourceId =
  typeof AccountTransactionSourceIdRaw.Type
