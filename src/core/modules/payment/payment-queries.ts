import {
  evoluJsonArrayFrom,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"
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

/**
 * The payment row behind the payment detail screen. Deliberately separate
 * from `paymentRequestQuery`: that one joins all five prepared-method tables
 * for the waiting screen but skips `deviceId`/`tableId`/`updatedAt`, which
 * only the detail screen reads.
 */
export const paymentDetailQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select([
        "id",
        "deviceId",
        "billId",
        "tableId",
        "amount",
        "currency",
        "tipAmount",
        "canceledAt",
        "confirmedPaidAt",
        "excessAcknowledgedAt",
        "expiresAt",
        "createdAt",
        "updatedAt",
      ])
      .where("id", "=", paymentId)
      .where("isDeleted", "is not", sqliteTrue)
      .where("amount", "is not", null)
      .where("currency", "is not", null)
      .where("tipAmount", "is not", null)
      .where("createdAt", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

export const paymentReconciliationsQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .leftJoin("account", (join) =>
        join
          .onRef("account.id", "=", "accountTransaction.accountId")
          .on("account.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionSource", (join) =>
        join
          .onRef(
            "accountTransactionSource.accountTransactionId",
            "=",
            "accountTransaction.id"
          )
          .on("accountTransactionSource.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionIban", (join) =>
        join
          .onRef("accountTransactionIban.id", "=", "accountTransaction.id")
          .on("accountTransactionIban.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionSpark", (join) =>
        join
          .onRef("accountTransactionSpark.id", "=", "accountTransaction.id")
          .on("accountTransactionSpark.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("accountTransactionLightning", (join) =>
        join
          .onRef("accountTransactionLightning.id", "=", "accountTransaction.id")
          .on("accountTransactionLightning.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "reconciliationClaim.id",
        "reconciliationClaim.source",
        "reconciliationClaim.claimedAt",
        "reconciliationClaim.accountTransactionId",
        "accountTransaction.accountId",
        "accountTransaction.kind as transactionKind",
        "accountTransaction.amount as transactionAmount",
        "accountTransaction.currency as transactionCurrency",
        "accountTransaction.occurredAt as transactionOccurredAt",
        "accountTransaction.note as transactionNote",
        "account.name as accountName",
        "accountTransactionSource.source as transactionSource",
        "accountTransactionSource.recordedAt as transactionRecordedAt",
        "accountTransactionIban.variableSymbol",
        "accountTransactionIban.bankReference",
        "accountTransactionSpark.sparkTransferId",
        "accountTransactionLightning.paymentHash",
      ])
      .where("reconciliationClaim.paymentId", "=", paymentId)
      .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      .where("accountTransaction.isDeleted", "is not", sqliteTrue)
      .where("reconciliationClaim.source", "is not", null)
      .where("reconciliationClaim.claimedAt", "is not", null)
      .where("accountTransaction.kind", "is not", null)
      .where("accountTransaction.amount", "is not", null)
      .where("accountTransaction.currency", "is not", null)
      .where("accountTransaction.occurredAt", "is not", null)
      .orderBy("reconciliationClaim.claimedAt", "desc")
      .$narrowType<{
        source: KyselyNotNull
        claimedAt: KyselyNotNull
        transactionKind: KyselyNotNull
        transactionAmount: KyselyNotNull
        transactionCurrency: KyselyNotNull
        transactionOccurredAt: KyselyNotNull
      }>()
  )

/**
 * The most recent payments, newest first — the read model behind the
 * `/activity` list. Mirrors `latestBillsQuery` in `bill-queries.ts`: embeds
 * everything `PaymentHistoryIssues` used to load per row via separate
 * `billId`/`paymentId`-scoped queries (`useBillCoverage`,
 * `activeClaimedTransactionsByPaymentIdQuery`, `claimedPaymentsByBillIdQuery`)
 * as `evoluJsonArrayFrom` subqueries, so the whole list loads in one round
 * trip instead of a per-row Suspense waterfall:
 *
 * - `ownClaimedTransactions` — this payment's own claimed transactions
 *   (mirrors `activeClaimedTransactionsByPaymentIdQuery`), for
 *   `derivePaymentHasExcessSettlement`.
 * - `billLines` — the bill's line ledger (mirrors `billLinesByBillIdQuery`),
 *   reduced via `calculateBillLineSummaries` for the bill's total.
 * - `billClaimedTransactions` — every claimed transaction across every
 *   payment on the same bill (mirrors `claimedTransactionsByBillIdQuery`),
 *   for the bill's `coverage` and for `hasOtherClaimedPayment` (any row here
 *   whose `paymentId` isn't this payment's). Reusing this instead of also
 *   embedding `claimedPaymentsByBillIdQuery`'s looser "has any claim at all"
 *   definition is a deliberate simplification: the two definitions only
 *   differ when a claim's `accountTransaction` was itself deleted after the
 *   fact, which no domain action in this app currently does.
 *
 * A `billId`-less payment naturally gets empty `billLines`/
 * `billClaimedTransactions` (the `whereRef` never matches `NULL`), the same
 * "nothing to flag" result the old `NO_BILL_ID` sentinel produced.
 *
 * Parametrized by `limit` for the infinite-scroll list: pass
 * `limit: pageSize + 1` and slice off the extra row to detect whether more
 * payments remain without a separate count query.
 */
export const latestPaymentsQuery = (limit: number) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .select([
        "payment.id",
        "payment.billId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.excessAcknowledgedAt",
        "payment.expiresAt",
        "payment.createdAt",
      ])
      .select((eb) => [
        evoluJsonArrayFrom(
          eb
            .selectFrom("reconciliationClaim as ownClaim")
            .innerJoin(
              "accountTransaction as ownClaimTx",
              "ownClaimTx.id",
              "ownClaim.accountTransactionId"
            )
            .select(["ownClaim.accountTransactionId", "ownClaimTx.amount"])
            .whereRef("ownClaim.paymentId", "=", "payment.id")
            .where("ownClaim.isDeleted", "is not", sqliteTrue)
            .where("ownClaim.accountTransactionId", "is not", null)
            .where("ownClaimTx.isDeleted", "is not", sqliteTrue)
            .where("ownClaimTx.amount", "is not", null)
            .$narrowType<{
              accountTransactionId: KyselyNotNull
              amount: KyselyNotNull
            }>()
        ).as("ownClaimedTransactions"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("billLine")
            .select([
              "billLine.id",
              "billLine.billId",
              "billLine.deviceId",
              "billLine.catalogItemId",
              "billLine.itemId",
              "billLine.type",
              "billLine.kind",
              "billLine.quantity",
              "billLine.totalAmount",
              "billLine.createdAt",
              "billLine.updatedAt",
              "billLine.isDeleted",
              "billLine.ownerId",
            ])
            .whereRef("billLine.billId", "=", "payment.billId")
            .where("billLine.billId", "is not", null)
            .where("billLine.itemId", "is not", null)
            .where("billLine.type", "is not", null)
            .where("billLine.kind", "is not", null)
            .where("billLine.quantity", "is not", null)
            .where("billLine.totalAmount", "is not", null)
            // See `billLinesByBillIdQuery` for why the tie-break matters
            // and why it is free in this exact shape.
            .orderBy("billLine.createdAt", "asc")
            .orderBy("billLine.ownerId", "asc")
            .orderBy("billLine.id", "asc")
            .$narrowType<{
              billId: KyselyNotNull
              itemId: KyselyNotNull
              type: KyselyNotNull
              kind: KyselyNotNull
              quantity: KyselyNotNull
              totalAmount: KyselyNotNull
            }>()
        ).as("billLines"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("item")
            .innerJoin("billLine as itemLine", "itemLine.itemId", "item.id")
            .select([
              "item.id",
              "item.catalogItemId",
              "item.name",
              "item.description",
              "item.currency",
              "item.unitAmount",
              "item.taxRateId",
              "item.createdAt",
              "item.updatedAt",
              "item.isDeleted",
              "item.ownerId",
            ])
            .distinct()
            .whereRef("itemLine.billId", "=", "payment.billId")
            .where("item.name", "is not", null)
            .where("item.currency", "is not", null)
            .where("item.unitAmount", "is not", null)
            .$narrowType<{
              name: KyselyNotNull
              currency: KyselyNotNull
              unitAmount: KyselyNotNull
            }>()
        ).as("billItems"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("payment as billPayment")
            .innerJoin("reconciliationClaim as billClaim", (join) =>
              join
                .onRef("billClaim.paymentId", "=", "billPayment.id")
                .on("billClaim.isDeleted", "is not", sqliteTrue)
            )
            .innerJoin(
              "accountTransaction as billClaimTx",
              "billClaimTx.id",
              "billClaim.accountTransactionId"
            )
            .select([
              "billPayment.id as paymentId",
              "billPayment.tipAmount",
              "billClaim.accountTransactionId",
              "billClaimTx.amount",
            ])
            .whereRef("billPayment.billId", "=", "payment.billId")
            .where("billPayment.isDeleted", "is not", sqliteTrue)
            .where("billPayment.tipAmount", "is not", null)
            .where("billClaim.accountTransactionId", "is not", null)
            .where("billClaimTx.isDeleted", "is not", sqliteTrue)
            .where("billClaimTx.amount", "is not", null)
            .$narrowType<{
              tipAmount: KyselyNotNull
              accountTransactionId: KyselyNotNull
              amount: KyselyNotNull
            }>()
        ).as("billClaimedTransactions"),
      ])
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .where("payment.createdAt", "is not", null)
      .orderBy("payment.createdAt", "desc")
      .limit(limit)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
  )

export const paymentRequestQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentBtc", (join) =>
        join
          .onRef("paymentBtc.id", "=", "payment.id")
          .on("paymentBtc.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcLightning", (join) =>
        join
          .onRef("paymentBtcLightning.id", "=", "payment.id")
          .on("paymentBtcLightning.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcSpark", (join) =>
        join
          .onRef("paymentBtcSpark.id", "=", "payment.id")
          .on("paymentBtcSpark.isDeleted", "is not", sqliteTrue)
      )
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
        "payment.id",
        "payment.billId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.expiresAt",
        "paymentBtc.amountSats",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcSpark.sparkInvoice",
        "paymentIban.accountId as ibanAccountId",
        "paymentIban.variableSymbol",
        "paymentIban.specificSymbol",
        "paymentCashRegister.accountId as cashRegisterAccountId",
      ])
      .where("payment.id", "=", paymentId)
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )

/**
 * Whether this payment has money against it, as one row or none. Joined
 * through `accountTransaction` rather than counting claims outright: a claim
 * whose transaction was deleted is not money that arrived, and the bill's
 * coverage already ignores it — see `paymentsWithClaimsByBillIdQuery` and
 * `claimedPaymentIdSet` for the same reading elsewhere.
 */
export const paymentClaimsQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .select(["reconciliationClaim.id", "reconciliationClaim.claimedAt"])
      .where("reconciliationClaim.paymentId", "=", paymentId)
      .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      .where("accountTransaction.isDeleted", "is not", sqliteTrue)
      .limit(1)
  )
