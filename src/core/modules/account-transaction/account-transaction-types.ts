import { id } from "@evolu/common"
import { z } from "zod"

import { AccountKindSchema } from "@/core/modules/account/account-types.ts"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const AccountTransactionIdRaw = id("AccountTransaction")
export const AccountTransactionId = standardSchemaToZod(AccountTransactionIdRaw)
export type AccountTransactionId = typeof AccountTransactionIdRaw.Output

export const AccountTransactionSourceIdRaw = id("AccountTransactionSource")
export const AccountTransactionSourceId = standardSchemaToZod(
  AccountTransactionSourceIdRaw
)
export type AccountTransactionSourceId =
  typeof AccountTransactionSourceIdRaw.Output

export const AccountTransactionKindSchema = z.enum([
  ...AccountKindSchema.options,
  "onchain",
])

export type AccountTransactionKind = z.output<
  typeof AccountTransactionKindSchema
>
