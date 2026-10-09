import { createIdFromString } from "@evolu/common"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { ReconciliationClaimId } from "@/core/modules/reconciliation-claim/reconciliation-claim-types.ts"

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
