import { type MutationOptions, ok, type Task } from "@evolu/common"
import type { DateDep } from "../../deps.ts"
import { cashuAccountQuery } from "../account/account-queries.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "../account-transaction/account-transaction-actions.ts"
import { accountTransactionExistsQuery } from "../account-transaction/account-transaction-queries.ts"
import { deriveCashuAccountTransactionId } from "../account-transaction/account-transaction-utils.ts"
import type { BillId } from "../bill/bill-types.ts"
import {
  loadAutomaticReconciliationClaimForNewAccountTransaction,
  loadBillClosedAtForPayment,
  upsertReconciliationClaimRows,
} from "../reconciliation-claim/reconciliation-claim-actions.ts"
import type { ReconciliationClaimWrite } from "../reconciliation-claim/reconciliation-claim-types.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { Integer, type TimestampMs } from "../shared/schema.ts"
import {
  loadCashuOperation,
  loadCashuReceive,
  loadCashuTopup,
} from "./cashu-guards.ts"
import type { CashuOperationId } from "./cashu-types.ts"

/**
 * Into Payky's books (cashu/0014): every topup of a payment and every
 * receive of Payky's own wallet becomes one `accountTransaction` of kind
 * `cashu` as it completes, with the automatic claim of the payment that holds
 * its quote or receive id. A move's topup and every melt are not income; a
 * withdrawal is booked by the withdrawal itself.
 *
 * The booking is written in the batch that completes the operation:
 * `loadCashuBooking` reads what it needs before that batch and
 * `upsertCashuBooking` writes it inside, so the money and its booking arrive
 * together on every device. The transaction's id derives from the
 * operation's, so two devices completing one operation write one row.
 */

/** The rows an incoming operation is booked with, loaded before its batch. */
export interface CashuBooking {
  readonly transaction: ReturnType<typeof computeAccountTransactionRows>
  readonly claim: ReconciliationClaimWrite | null
  readonly billClosing: {
    readonly billId: BillId
    readonly closedAt: TimestampMs
  } | null
}

/**
 * The booking `operationId` completes with at `settledAt`, or null: not
 * income, nothing left after the fee, no Cashu account, or a transaction
 * another device wrote already, which is not written again.
 */
export const loadCashuBooking =
  (
    operationId: CashuOperationId,
    settledAt: TimestampMs
  ): Task<CashuBooking | null, never, EvoluDep & DateDep> =>
  async (run) => {
    const { evolu, date } = run.deps
    const operation = await run.ok(loadCashuOperation(operationId))
    if (operation === null) return ok(null)
    const income = await (async () => {
      if (operation.kind === "topup") {
        const topup = await run.ok(loadCashuTopup(operationId))
        if (topup === null || topup.purpose !== "payment") return null
        return { amount: operation.amount, quoteId: topup.quoteId }
      }
      if (operation.kind === "receive") {
        const receive = await run.ok(loadCashuReceive(operationId))
        if (receive === null) return null
        // A token is worth its face value less the mint's input fee (cashu/0009).
        return { amount: operation.amount - receive.fee, quoteId: null }
      }
      return null
    })()
    if (income === null || income.amount <= 0) return ok(null)
    const [account] = await evolu.loadQuery(cashuAccountQuery)
    if (account === undefined) return ok(null)
    const accountTransactionId = deriveCashuAccountTransactionId(operationId)
    const [existing] = await evolu.loadQuery(
      accountTransactionExistsQuery(accountTransactionId)
    )
    if (existing !== undefined) return ok(null)

    const input = {
      accountId: account.id,
      amount: Integer(income.amount),
      currency: "BTC" as const,
      occurredAt: settledAt,
      note: null,
      internalTransferGroupId: null,
      source: { deviceId: null, source: "auto" as const },
      cashu: {
        cashuOperationId: operationId,
        quoteId: income.quoteId,
        mintUrl: operation.mintUrl,
      },
    }
    const transaction = computeAccountTransactionRows(input, date.now())
    const claim = await run.ok(
      loadAutomaticReconciliationClaimForNewAccountTransaction(
        input,
        transaction.id
      )
    )
    const billClosing =
      claim === null
        ? null
        : await run.ok(
            loadBillClosedAtForPayment(claim.paymentId, {
              id: transaction.id,
              kind: transaction.kind,
              amount: input.amount,
              currency: "BTC",
            })
          )
    return ok({ transaction, claim, billClosing })
  }

/** Writes a booking `loadCashuBooking` loaded into the completing batch. */
export const upsertCashuBooking = (
  evolu: EvoluDep["evolu"],
  booking: CashuBooking,
  options: MutationOptions
): void => {
  upsertAccountTransactionRows(evolu, booking.transaction, options)
  if (booking.claim !== null)
    upsertReconciliationClaimRows(
      evolu,
      booking.claim,
      booking.billClosing,
      options
    )
}
