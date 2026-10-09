import { id } from "@evolu/common"
import { z } from "zod"
import { standardSchemaToZod } from "@/zod-utils.ts"

export const WithdrawalIdRaw = id("Withdrawal")
export const WithdrawalId = standardSchemaToZod(WithdrawalIdRaw)
export type WithdrawalId = typeof WithdrawalIdRaw.Output

/**
 * Why a withdrawal's `failedAt` was written (withdraw/0003): `rejected` — the
 * SDK refused a Lightning payment and no transfer exists; `returned` — the
 * money came back; `not-created` — the transfer never appeared in time;
 * `manual` — the operator confirmed an on-chain withdrawal did not leave.
 */
export const WithdrawalFailureReasonSchema = z.enum([
  "rejected",
  "returned",
  "not-created",
  "manual",
])
export type WithdrawalFailureReason = z.output<
  typeof WithdrawalFailureReasonSchema
>
