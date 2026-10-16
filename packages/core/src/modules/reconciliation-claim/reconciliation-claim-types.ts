import { id } from "@evolu/common"
import { standardSchemaToZod } from "../../zod-utils.ts"
import type { AccountTransactionId } from "../account-transaction/account-transaction-types.ts"
import type { DeviceId } from "../device/device-types.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import type { SyncSource, TimestampMs } from "../shared/schema.ts"

export const ReconciliationClaimIdRaw = id("ReconciliationClaim")
export const ReconciliationClaimId = standardSchemaToZod(
  ReconciliationClaimIdRaw
)
export type ReconciliationClaimId = typeof ReconciliationClaimIdRaw.Output

/** A claim row as the actions write it. */
export interface ReconciliationClaimWrite {
  readonly id: ReconciliationClaimId
  readonly deviceId: DeviceId | null
  readonly paymentId: PaymentId
  readonly accountTransactionId: AccountTransactionId
  readonly source: SyncSource
  readonly claimedAt: TimestampMs
}
