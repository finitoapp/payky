import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { PaymentId } from "./payment-types.ts"

export const paymentByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .selectAll()
      .where("id", "=", idValue)
      .where("amount", "is not", null)
      .where("currency", "is not", null)
      .where("tipAmount", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )

/**
 * Every non-deleted payment for a bill, newest first, with its claim count —
 * the read model behind the bill detail page's "payments on this bill"
 * section. Mirrors `latestPaymentsQuery` in `payment-history.tsx` (same
 * shape, filtered by `billId` instead of capped globally), so
 * `derivePaymentStatus` can be computed the same way for each row.
 *
 * `claimCount` counts claims whose `accountTransaction` is still there, not
 * claims outright: it feeds `derivePaymentStatus`'s `hasActiveClaim`, and a
 * claim pointing at a deleted transaction is not money that arrived — the
 * bill's own coverage (`calculateClaimedSum`) already ignores it, so counting
 * it here displayed a payment as paid while it funded nothing. Same reading
 * the editing lock settled on; see `claimedPaymentIdSet`.
 */
export const paymentsWithClaimsByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("reconciliationClaim", (join) =>
        join
          .onRef("reconciliationClaim.paymentId", "=", "payment.id")
          .on("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransaction", (join) =>
        join
          .onRef(
            "accountTransaction.id",
            "=",
            "reconciliationClaim.accountTransactionId"
          )
          .on("accountTransaction.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "payment.id",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.expiresAt",
        "payment.createdAt",
      ])
      .select((eb) =>
        eb.fn.count<number>("accountTransaction.id").as("claimCount")
      )
      .where("payment.billId", "=", billId)
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .where("payment.createdAt", "is not", null)
      .groupBy([
        "payment.id",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.expiresAt",
        "payment.createdAt",
      ])
      .orderBy("payment.createdAt", "desc")
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

/**
 * The account and invoice identifiers a Spark payment was prepared with, for
 * matching an incoming transfer the same way
 * `sparkReconciliationCandidateByAccountTransactionIdQuery` does.
 */
export const paymentSparkDetailsByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("paymentBtc")
      .leftJoin("paymentBtcLightning", (join) =>
        join
          .onRef("paymentBtcLightning.id", "=", "paymentBtc.id")
          .on("paymentBtcLightning.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcSpark", (join) =>
        join
          .onRef("paymentBtcSpark.id", "=", "paymentBtc.id")
          .on("paymentBtcSpark.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "paymentBtc.accountId",
        "paymentBtc.amountSats",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcSpark.sparkInvoice",
      ])
      .where("paymentBtc.id", "=", idValue)
      .where("paymentBtc.isDeleted", "is not", sqliteTrue)
      .where("paymentBtc.accountId", "is not", null)
      .where("paymentBtc.amountSats", "is not", null)
      .$narrowType<{
        accountId: KyselyNotNull
        amountSats: KyselyNotNull
      }>()
  )

/**
 * The account ids of a payment's prepared methods that never expire on
 * their own — a cash register drawer or a bank transfer. Read by
 * `preparePaymentMethod`: `payment.expiresAt` describes the payment as a
 * whole, but the methods are not mutually exclusive (a payment can offer
 * Lightning *and* cash), so the payment only expires while every prepared
 * method has an expiry window of its own. See docs/bill-payment-states.md.
 */
export const paymentNonExpiringMethodsByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentIban", (join) =>
        join
          .onRef("paymentIban.id", "=", "payment.id")
          .on("paymentIban.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentCashRegister", (join) =>
        join
          .onRef("paymentCashRegister.id", "=", "payment.id")
          .on("paymentCashRegister.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "paymentIban.accountId as ibanAccountId",
        "paymentCashRegister.accountId as cashRegisterAccountId",
      ])
      .where("payment.id", "=", idValue)
      .where("payment.isDeleted", "is not", sqliteTrue)
  )

/**
 * The account, amount, and symbol identifiers an IBAN payment was prepared
 * with, for matching an incoming bank transaction the same way
 * `ibanReconciliationCandidateByAccountTransactionIdQuery` does.
 */
export const paymentIbanDetailsByIdQuery = (idValue: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .innerJoin("paymentIban", (join) =>
        join
          .onRef("paymentIban.id", "=", "payment.id")
          .on("paymentIban.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "payment.amount",
        "payment.currency",
        "paymentIban.accountId",
        "paymentIban.variableSymbol",
        "paymentIban.specificSymbol",
      ])
      .where("payment.id", "=", idValue)
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("paymentIban.accountId", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        accountId: KyselyNotNull
      }>()
  )
