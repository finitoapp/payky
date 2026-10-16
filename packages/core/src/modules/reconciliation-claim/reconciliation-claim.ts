import type { IndexesConfig } from "@evolu/common/local-first"

import { AccountTransactionId } from "../account-transaction/account-transaction-types.ts"
import { DeviceId } from "../device/device-types.ts"
import { PaymentId } from "../payment/payment-types.ts"
import {
  type InferTable,
  SyncSourceSchema,
  TimestampMsSchema,
} from "../shared/schema.ts"
import { ReconciliationClaimId } from "./reconciliation-claim-types.ts"

export const reconciliationClaim = {
  id: ReconciliationClaimId,
  deviceId: DeviceId.nullable(),
  paymentId: PaymentId,
  accountTransactionId: AccountTransactionId,
  source: SyncSourceSchema,
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
  // The sales statistics' "IBAN confirmed by hand" signal ranges over it;
  // `source = "manual"` alone matches every cash payment ever.
  create("reconciliationClaim_claimedAt")
    .on("reconciliationClaim")
    .column("claimedAt"),
]) satisfies IndexesConfig

export type ReconciliationClaimRow = InferTable<typeof reconciliationClaim>
