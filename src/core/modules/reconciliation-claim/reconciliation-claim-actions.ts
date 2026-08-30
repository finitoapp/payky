import { createIdFromString, ok, type Task } from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import {
  loadBillClosingAfterClaim,
  upsertBillClosedRow,
} from "@/core/modules/bill/bill-actions.ts"
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
 * Given a payment about to gain a claim, checks whether closing its bill
 * should be folded into the same mutation batch as the claim write — see
 * `loadBillClosingAfterClaim`. Reads the payment directly through
 * `payment-queries.ts` (not `payment-actions.ts`) to avoid a circular
 * dependency, since `payment-actions.ts` composes this module's
 * `claimManualReconciliation`.
 */
const loadBillClosingForPayment =
  (
    paymentId: PaymentId
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

    return ok(await run.ok(loadBillClosingAfterClaim(paymentRow)))
  }

/**
 * Writes a reconciliation claim and, if it now fully covers the claimed
 * payment's bill, closes that bill in the same mutation batch — shared by
 * `claimManualReconciliation` and `reconcileAccountTransaction` so the
 * "closing is atomic with the claim" guarantee lives in one place instead
 * of being duplicated (and possibly forgotten) at each call site.
 *
 * Re-checks once more immediately after the batch commits, folding in a
 * closing write then if warranted. This narrows — but, under CRDT/
 * multi-device concurrency, cannot fully eliminate — the window where two
 * payments on the same split bill are reconciled at nearly the same time
 * and each computes "still underpaid" before seeing the other's not-yet-
 * committed claim. See docs/bill-payment-states.md.
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
    const billClosing = await run.ok(loadBillClosingForPayment(claim.paymentId))

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
        upsertBillClosedRow(
          run.deps.evolu,
          billClosing.billId,
          billClosing.closedAt,
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })

    if (billClosing === null) {
      const recheck = await run.ok(loadBillClosingForPayment(claim.paymentId))
      if (recheck !== null) {
        await runMutationWithCompletion((options) =>
          upsertBillClosedRow(
            run.deps.evolu,
            recheck.billId,
            recheck.closedAt,
            { ...options, ownerId: evoluOwnerId }
          )
        )
      }
    }

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
