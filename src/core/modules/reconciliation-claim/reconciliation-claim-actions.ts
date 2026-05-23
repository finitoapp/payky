import { createIdFromString, ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import {
  activeReconciliationClaimByAccountTransactionIdQuery,
  cashRegisterReconciliationCandidateByAccountTransactionIdQuery,
  ibanReconciliationCandidateByAccountTransactionIdQuery,
  sparkReconciliationCandidateByAccountTransactionIdQuery,
} from "./reconciliation-claim-queries.ts"

export const reconcileAccountTransaction =
  (
    accountTransactionId: AccountTransactionId
  ): Task<PaymentId | null, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const existingClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimByAccountTransactionIdQuery(accountTransactionId)
    )
    const existingClaim = existingClaims[0]
    if (existingClaim?.paymentId != null) return ok(existingClaim.paymentId)

    const ibanCandidates = await run.deps.evolu.loadQuery(
      ibanReconciliationCandidateByAccountTransactionIdQuery(
        accountTransactionId
      )
    )
    const sparkCandidates =
      ibanCandidates.length > 0
        ? []
        : await run.deps.evolu.loadQuery(
            sparkReconciliationCandidateByAccountTransactionIdQuery(
              accountTransactionId
            )
          )
    const cashRegisterCandidates =
      ibanCandidates.length > 0 || sparkCandidates.length > 0
        ? []
        : await run.deps.evolu.loadQuery(
            cashRegisterReconciliationCandidateByAccountTransactionIdQuery(
              accountTransactionId
            )
          )
    const candidate =
      ibanCandidates[0] ?? sparkCandidates[0] ?? cashRegisterCandidates[0]
    if (!candidate) return ok(null)

    const id = createIdFromString<"ReconciliationClaim">(
      `reconciliationClaim:automatic:${candidate.paymentId}:${accountTransactionId}`
    )

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues({
          id,
          deviceId: null,
          paymentId: candidate.paymentId,
          accountTransactionId,
          source: "auto" as const,
          claimedAt: Date.now(),
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )

    return ok(candidate.paymentId)
  }
