import { createIdFromString } from "@evolu/common"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type {
  ReconciliationClaimId,
  ReconciliationClaimWrite,
} from "@/core/modules/reconciliation-claim/reconciliation-claim-types.ts"
import { TimestampMsSchema } from "@/core/modules/shared/schema.ts"

/**
 * The id of a hand-made claim of `accountTransactionId` for `paymentId`, so
 * confirming the same movement twice re-uses the claim instead of adding one.
 */
export const deriveManualReconciliationClaimId = (
  paymentId: PaymentId,
  accountTransactionId: AccountTransactionId
): ReconciliationClaimId =>
  createIdFromString<"ReconciliationClaim">(
    `reconciliationClaim:manual:${paymentId}:${accountTransactionId}`
  )

/**
 * The claim an automatic match gives `paymentId` for `accountTransactionId`,
 * keyed by both so a replayed sync re-uses it instead of adding another.
 */
export const createAutomaticReconciliationClaim = (
  paymentId: PaymentId,
  accountTransactionId: AccountTransactionId,
  now: Date
): ReconciliationClaimWrite => ({
  id: createIdFromString<"ReconciliationClaim">(
    `reconciliationClaim:automatic:${paymentId}:${accountTransactionId}`
  ),
  deviceId: null,
  paymentId,
  accountTransactionId,
  source: "auto",
  claimedAt: TimestampMsSchema.decode(now.getTime()),
})
