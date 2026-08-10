import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
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
