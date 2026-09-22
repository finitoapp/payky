import {
  createIdFromString,
  type MutationOptions,
  ok,
  type Task,
} from "@evolu/common"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CreateAccountTransactionInput } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { accountTransactionAmountByIdQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { upsertBillClosedAt } from "@/core/modules/bill/bill-actions.ts"
import { loadBillClosedAtIfCovered } from "@/core/modules/bill/bill-guards.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { paymentBillCoverageByIdQuery } from "@/core/modules/payment/payment-queries.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import {
  type Currency,
  NonNegativeInteger,
  type SyncSource,
  type TimestampMs,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  activeReconciliationClaimByAccountTransactionIdQuery,
  cashRegisterReconciliationCandidateByAccountTransactionIdQuery,
  ibanReconciliationCandidateByAccountTransactionIdQuery,
  ibanReconciliationCandidateByValuesQuery,
  sparkReconciliationCandidateByAccountTransactionIdQuery,
  sparkReconciliationCandidateByValuesQuery,
} from "./reconciliation-claim-queries.ts"
import type { ReconciliationClaimId } from "./reconciliation-claim-types.ts"

/**
 * Given a payment about to gain a claim, checks whether its bill's
 * `closedAt` cache should be refreshed in the same mutation batch as the
 * claim write — see `loadBillClosedAtIfCovered`. Reads the payment directly
 * through `payment-queries.ts` (not `payment-actions.ts`) to avoid a
 * circular dependency, since `payment-actions.ts` composes this module's
 * `claimManualReconciliation`.
 *
 * Exported so a caller that must write the claim in the same mutation batch
 * as something else (the account transaction it claims, in
 * `markPaymentPaid`) can run this read first and pass the result to
 * {@link upsertReconciliationClaimRows} directly, instead of always opening
 * a separate batch through {@link writeClaimAndCloseBillIfCovered}.
 */
export const loadBillClosedAtForPayment =
  (
    paymentId: PaymentId,
    /**
     * The transaction the claim points at, by value: what it is worth and
     * in which currency. Passed rather than read back because
     * `markPaymentPaid` and the sync jobs call this *before* writing it —
     * the row is not in the database yet.
     */
    claimedTransaction: {
      readonly id: AccountTransactionId
      readonly amount: number
      readonly currency: Currency
    }
  ): Task<
    { readonly billId: BillId; readonly closedAt: TimestampMs } | null,
    never,
    EvoluDep & DateDep
  > =>
  async (run) => {
    const [paymentRow] = await run.deps.evolu.loadQuery(
      paymentBillCoverageByIdQuery(paymentId)
    )
    if (paymentRow === undefined) return ok(null)

    return ok(
      await run.ok(loadBillClosedAtIfCovered(paymentRow, claimedTransaction))
    )
  }

export interface ReconciliationClaimWrite {
  readonly id: ReconciliationClaimId
  readonly deviceId: DeviceId | null
  readonly paymentId: PaymentId
  readonly accountTransactionId: AccountTransactionId
  readonly source: SyncSource
  readonly claimedAt: TimestampMs
}

const createAutomaticReconciliationClaim = (
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

/**
 * Finds the automatic claim a newly discovered FIO or Spark transaction
 * should receive before the transaction exists in Evolu, so the caller can
 * write both rows in one mutation batch.
 */
export const loadAutomaticReconciliationClaimForNewAccountTransaction =
  (
    accountTransaction: CreateAccountTransactionInput,
    accountTransactionId: AccountTransactionId
  ): Task<ReconciliationClaimWrite | null, never, EvoluDep & DateDep> =>
  async (run) => {
    const { iban, spark } = accountTransaction
    let paymentId: PaymentId | undefined

    if (iban?.variableSymbol !== null && iban?.variableSymbol !== undefined) {
      if (
        accountTransaction.amount < 0 ||
        accountTransaction.currency === "BTC"
      )
        return ok(null)
      const candidates = await run.deps.evolu.loadQuery(
        ibanReconciliationCandidateByValuesQuery({
          accountId: accountTransaction.accountId,
          amount: NonNegativeInteger(accountTransaction.amount),
          currency: accountTransaction.currency,
          variableSymbol: iban.variableSymbol,
          specificSymbol: iban.specificSymbol ?? null,
        })
      )
      paymentId = candidates[0]?.paymentId
    } else if (spark) {
      if (
        accountTransaction.amount < 0 ||
        accountTransaction.currency !== "BTC"
      )
        return ok(null)
      const candidates = await run.deps.evolu.loadQuery(
        sparkReconciliationCandidateByValuesQuery({
          accountId: accountTransaction.accountId,
          amount: NonNegativeInteger(accountTransaction.amount),
          lnInvoice: spark.lightning?.lnInvoice ?? null,
          sparkInvoice: spark.sparkInvoice?.sparkInvoice ?? null,
        })
      )
      paymentId = candidates[0]?.paymentId
    }

    return ok(
      paymentId === undefined
        ? null
        : createAutomaticReconciliationClaim(
            paymentId,
            accountTransactionId,
            run.deps.date.now()
          )
    )
  }

/**
 * Upserts a reconciliation claim and, if `billClosing` says it now fully
 * covers the claimed payment's bill, that bill's `closedAt` cache — both in
 * one call to the caller's own `MutationOptions`, so they land in whichever
 * mutation batch the caller is building. Pass the result of
 * {@link loadBillClosedAtForPayment} as `billClosing`.
 */
export const upsertReconciliationClaimRows = (
  evolu: EvoluDep["evolu"],
  claim: ReconciliationClaimWrite,
  billClosing: {
    readonly billId: BillId
    readonly closedAt: TimestampMs
  } | null,
  options: MutationOptions
): void => {
  evolu.upsert("reconciliationClaim", removeUndefinedValues(claim), options)

  if (billClosing !== null) {
    upsertBillClosedAt(evolu, billClosing.billId, billClosing.closedAt, options)
  }
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
  (
    claim: ReconciliationClaimWrite
  ): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    // Unlike the sync jobs and `markPaymentPaid`, this path claims a
    // transaction that already exists, so its amount has to be read back
    // before coverage can be told what the claim is worth.
    const [claimedTransaction] = await run.deps.evolu.loadQuery(
      accountTransactionAmountByIdQuery(claim.accountTransactionId)
    )
    const billClosing =
      claimedTransaction === undefined
        ? null
        : await run.ok(
            loadBillClosedAtForPayment(claim.paymentId, {
              id: claim.accountTransactionId,
              amount: claimedTransaction.amount,
              currency: claimedTransaction.currency,
            })
          )

    await runMutationWithCompletion((options) =>
      upsertReconciliationClaimRows(run.deps.evolu, claim, billClosing, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

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

    await run.ok(
      writeClaimAndCloseBillIfCovered({
        ...createAutomaticReconciliationClaim(
          candidate.paymentId,
          accountTransactionId,
          run.deps.date.now()
        ),
      })
    )

    return ok(candidate.paymentId)
  }
