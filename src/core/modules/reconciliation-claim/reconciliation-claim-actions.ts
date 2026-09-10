import { createIdFromString, ok, type Task } from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { upsertBillClosedAt } from "@/core/modules/bill/bill-actions.ts"
import { loadBillClosedAtIfCovered } from "@/core/modules/bill/bill-guards.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { paymentByIdQuery } from "@/core/modules/payment/payment-queries.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  type SyncSource,
  type TimestampMs,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
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
import type { ReconciliationClaimId } from "./reconciliation-claim-types.ts"

/**
 * Given a payment about to gain a claim, checks whether its bill's
 * `closedAt` cache should be refreshed in the same mutation batch as the
 * claim write — see `loadBillClosedAtIfCovered`. Reads the payment directly
 * through `payment-queries.ts` (not `payment-actions.ts`) to avoid a
 * circular dependency, since `payment-actions.ts` composes this module's
 * `claimManualReconciliation`.
 */
const loadBillClosedAtForPayment =
  (
    paymentId: PaymentId,
    accountTransactionId: AccountTransactionId
  ): Task<
    { readonly billId: BillId; readonly closedAt: TimestampMs } | null,
    never,
    EvoluDep & DateDep
  > =>
  async (run) => {
    const [paymentRow] = await run.deps.evolu.loadQuery(
      paymentByIdQuery(paymentId)
    )
    if (paymentRow === undefined) return ok(null)

    return ok(
      await run.ok(loadBillClosedAtIfCovered(paymentRow, accountTransactionId))
    )
  }

/**
 * Writes a reconciliation claim and, if it now fully covers the claimed
 * payment's bill, refreshes that bill's `closedAt` cache in the same
 * mutation batch — shared by `claimManualReconciliation` and
 * `reconcileAccountTransaction` so this isn't duplicated (and possibly
 * forgotten) at each call site.
 *
 * Unlike the old status-closing write this replaced, there is no
 * "recheck right after commit" step: `closedAt` is only ever a best-effort
 * cache (see `bill.ts`'s doc comment) — nothing that decides
 * money-correctness reads it, so under CRDT/multi-device concurrency it can
 * lag a split bill's true coverage for a while without being a correctness
 * problem, only a cosmetic one in `openBillsQuery`'s list. See
 * docs/bill-payment-states.md.
 */
const writeClaimAndCloseBillIfCovered =
  (claim: {
    readonly id: ReconciliationClaimId
    readonly deviceId: DeviceId | null
    readonly paymentId: PaymentId
    readonly accountTransactionId: AccountTransactionId
    readonly source: SyncSource
    readonly claimedAt: TimestampMs
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const billClosing = await run.ok(
      loadBillClosedAtForPayment(claim.paymentId, claim.accountTransactionId)
    )

    await runMutationWithCompletion((options) => {
      run.deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues(claim),
        {
          ...options,
          ownerId: evoluOwnerId,
        }
      )

      if (billClosing !== null) {
        upsertBillClosedAt(
          run.deps.evolu,
          billClosing.billId,
          billClosing.closedAt,
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })

    return ok(undefined)
  }

export const claimManualReconciliation =
  ({
    paymentId,
    accountTransactionId,
    deviceId,
  }: {
    readonly paymentId: PaymentId
    readonly accountTransactionId: AccountTransactionId
    readonly deviceId: DeviceId | null
  }): Task<PaymentId, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const id = createIdFromString<"ReconciliationClaim">(
      `reconciliationClaim:manual:${paymentId}:${accountTransactionId}`
    )

    await run.ok(
      writeClaimAndCloseBillIfCovered({
        id,
        deviceId,
        paymentId,
        accountTransactionId,
        source: "manual",
        claimedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
      })
    )

    return ok(paymentId)
  }

export const reconcileAccountTransaction =
  (
    accountTransactionId: AccountTransactionId
  ): Task<PaymentId | null, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const existingClaims = await run.deps.evolu.loadQuery(
      activeReconciliationClaimByAccountTransactionIdQuery(accountTransactionId)
    )
    const existingClaim = existingClaims[0]
    if (
      existingClaim?.paymentId !== null &&
      existingClaim?.paymentId !== undefined
    )
      return ok(existingClaim.paymentId)

    // Asked together rather than in sequence. Each candidate query filters on
    // `accountTransaction.kind`, which is a single non-nullable enum, so at
    // most one of the three can ever return a row: the kind decides, and the
    // `??` order below is only a total function over that, not a tie-break
    // (pinned by "picks the candidate matching the transaction's kind"). The
    // short-circuit it replaces therefore skipped nothing the kind filter
    // would not have — it only cost round trips, one per incoming transaction
    // on the sync jobs' hot path.
    const [ibanCandidates, sparkCandidates, cashRegisterCandidates] =
      await Promise.all(
        run.deps.evolu.loadQueries([
          ibanReconciliationCandidateByAccountTransactionIdQuery(
            accountTransactionId
          ),
          sparkReconciliationCandidateByAccountTransactionIdQuery(
            accountTransactionId
          ),
          cashRegisterReconciliationCandidateByAccountTransactionIdQuery(
            accountTransactionId
          ),
        ])
      )
    const candidate =
      ibanCandidates[0] ?? sparkCandidates[0] ?? cashRegisterCandidates[0]
    if (!candidate) return ok(null)

    const id = createIdFromString<"ReconciliationClaim">(
      `reconciliationClaim:automatic:${candidate.paymentId}:${accountTransactionId}`
    )

    await run.ok(
      writeClaimAndCloseBillIfCovered({
        id,
        deviceId: null,
        paymentId: candidate.paymentId,
        accountTransactionId,
        source: "auto",
        claimedAt: TimestampMsSchema.decode(run.deps.date.now().getTime()),
      })
    )

    return ok(candidate.paymentId)
  }
