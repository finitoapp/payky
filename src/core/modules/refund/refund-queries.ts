import {
  evoluJsonArrayFrom,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"

const refundColumns = [
  "refund.id",
  "refund.paymentId",
  "refund.deviceId",
  "refund.amount",
  "refund.currency",
  "refund.method",
  "refund.refundedAt",
] as const

type RefundRequiredColumns = {
  paymentId: KyselyNotNull
  amount: KyselyNotNull
  currency: KyselyNotNull
  method: KyselyNotNull
  refundedAt: KyselyNotNull
}

export const refundsByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("refund")
      .select(refundColumns)
      .where("refund.paymentId", "=", paymentId)
      .where("refund.isDeleted", "is not", sqliteTrue)
      .where("refund.amount", "is not", null)
      .where("refund.currency", "is not", null)
      .where("refund.method", "is not", null)
      .where("refund.refundedAt", "is not", null)
      .orderBy("refund.refundedAt")
      .orderBy("refund.createdAt")
      .orderBy("refund.id")
      .$narrowType<RefundRequiredColumns>()
  )

const selectRefundSummaries = (
  db: Parameters<Parameters<typeof createQuery>[0]>[0]
) =>
  db
    .selectFrom("refund")
    .innerJoin("payment", "payment.id", "refund.paymentId")
    .leftJoin("paymentCashRegister", (join) =>
      join
        .onRef("paymentCashRegister.id", "=", "payment.id")
        .on("paymentCashRegister.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("paymentBtc", (join) =>
      join
        .onRef("paymentBtc.id", "=", "payment.id")
        .on("paymentBtc.isDeleted", "is not", sqliteTrue)
    )
    .select((eb) => [
      "refund.paymentId",
      "refund.amount",
      "refund.currency",
      "payment.billId",
      "payment.amount as paymentAmount",
      "payment.currency as paymentCurrency",
      "paymentBtc.amountSats as paymentAmountSats",
      "paymentCashRegister.receivedAmount as cashReceivedAmount",
      evoluJsonArrayFrom(
        eb
          .selectFrom("reconciliationClaim")
          .innerJoin(
            "accountTransaction",
            "accountTransaction.id",
            "reconciliationClaim.accountTransactionId"
          )
          .select([
            "reconciliationClaim.accountTransactionId",
            "accountTransaction.amount",
            "accountTransaction.currency",
          ])
          .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
          .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
          .where("reconciliationClaim.accountTransactionId", "is not", null)
          .where("accountTransaction.isDeleted", "is not", sqliteTrue)
          .where("accountTransaction.amount", "is not", null)
          .where("accountTransaction.currency", "is not", null)
          .$narrowType<{
            accountTransactionId: KyselyNotNull
            amount: KyselyNotNull
            currency: KyselyNotNull
          }>()
      ).as("paymentClaims"),
    ])
    .where("refund.isDeleted", "is not", sqliteTrue)
    .where("refund.paymentId", "is not", null)
    .where("refund.amount", "is not", null)
    .where("refund.currency", "is not", null)
    .where("payment.amount", "is not", null)
    .where("payment.currency", "is not", null)
    .$narrowType<{
      paymentId: KyselyNotNull
      amount: KyselyNotNull
      currency: KyselyNotNull
      paymentAmount: KyselyNotNull
      paymentCurrency: KyselyNotNull
    }>()

export const refundSummariesQuery = createQuery((db) =>
  selectRefundSummaries(db)
)

export const refundSummariesByBillIdQuery = (billId: BillId) =>
  createQuery((db) =>
    selectRefundSummaries(db).where("payment.billId", "=", billId)
  )

export const refundLinesByPaymentIdQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("refundLine")
      .innerJoin("paymentLine", "paymentLine.id", "refundLine.paymentLineId")
      .innerJoin("item", "item.id", "paymentLine.itemId")
      .select([
        "refundLine.id",
        "refundLine.refundId",
        "refundLine.paymentLineId",
        "refundLine.quantity",
        "refundLine.amount",
        "item.name",
      ])
      .where("refundLine.paymentId", "=", paymentId)
      .where("refundLine.isDeleted", "is not", sqliteTrue)
      .where("refundLine.refundId", "is not", null)
      .where("refundLine.paymentLineId", "is not", null)
      .where("refundLine.quantity", "is not", null)
      .where("refundLine.amount", "is not", null)
      .where("item.name", "is not", null)
      .$narrowType<{
        refundId: KyselyNotNull
        paymentLineId: KyselyNotNull
        quantity: KyselyNotNull
        amount: KyselyNotNull
        name: KyselyNotNull
      }>()
  )

export const refundablePaymentLinesQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("paymentLine")
      .innerJoin("item", "item.id", "paymentLine.itemId")
      .select([
        "paymentLine.id",
        "paymentLine.type",
        "paymentLine.quantity",
        "paymentLine.totalAmount",
        "item.name",
      ])
      .where("paymentLine.paymentId", "=", paymentId)
      .where("paymentLine.isDeleted", "is not", sqliteTrue)
      .where("paymentLine.type", "is not", null)
      .where("paymentLine.quantity", "is not", null)
      .where("paymentLine.totalAmount", "is not", null)
      .where("item.name", "is not", null)
      .orderBy("item.name")
      .orderBy("paymentLine.id")
      .$narrowType<{
        type: KyselyNotNull
        quantity: KyselyNotNull
        totalAmount: KyselyNotNull
        name: KyselyNotNull
      }>()
  )

export const otherClaimedPaymentOfBillQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment as own")
      .innerJoin("payment as other", "other.billId", "own.billId")
      .innerJoin("reconciliationClaim", (join) =>
        join
          .onRef("reconciliationClaim.paymentId", "=", "other.id")
          .on("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      )
      .select(["other.id"])
      .where("own.id", "=", paymentId)
      .where("other.id", "!=", paymentId)
      .where("other.isDeleted", "is not", sqliteTrue)
      .limit(1)
  )
