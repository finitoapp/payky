import type { IndexesConfig } from "@evolu/common/local-first"
import { z } from "zod"

import { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import {
  type InferTable,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { ReconciliationClaimId } from "./reconciliation-claim-types.ts"

export const ReconciliationClaimSourceSchema = z.enum([
  "manual",
  "automaticScript",
])

export const reconciliationClaim = {
  id: ReconciliationClaimId,
  deviceId: DeviceId.nullable(),
  paymentId: PaymentId,
  accountTransactionId: AccountTransactionId,
  source: ReconciliationClaimSourceSchema,
  claimedAt: TimestampMsSchema,
} as const

export const reconciliationClaimIndexes = ((create) => [
  create("reconciliationClaim_paymentId")
    .on("reconciliationClaim")
    .column("paymentId"),
  create("reconciliationClaim_accountTransactionId")
    .on("reconciliationClaim")
    .column("accountTransactionId"),
  create("reconciliationClaim_paymentId_accountTransactionId")
    .on("reconciliationClaim")
    .columns(["paymentId", "accountTransactionId"]),
  create("reconciliationClaim_source")
    .on("reconciliationClaim")
    .column("source"),
]) satisfies IndexesConfig

export type ReconciliationClaimSource = z.output<
  typeof ReconciliationClaimSourceSchema
>
export type ReconciliationClaimRow = InferTable<typeof reconciliationClaim>
