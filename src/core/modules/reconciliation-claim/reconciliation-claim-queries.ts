import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"

export const activeReconciliationClaimByAccountTransactionIdQuery = (
  accountTransactionId: AccountTransactionId
) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .selectAll()
      .where("accountTransactionId", "=", accountTransactionId)
      .where("isDeleted", "is not", 1)
  )

export const ibanReconciliationCandidateByAccountTransactionIdQuery = (
  accountTransactionId: AccountTransactionId
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionIban",
        "accountTransactionIban.id",
        "accountTransaction.id"
      )
      .innerJoin("paymentIban", (join) =>
        join
          .onRef("paymentIban.accountId", "=", "accountTransaction.accountId")
          .onRef(
            "paymentIban.variableSymbol",
            "=",
            "accountTransactionIban.variableSymbol"
          )
          .on((eb) =>
            eb.or([
              eb(
                "paymentIban.specificSymbol",
                "=",
                eb.ref("accountTransactionIban.specificSymbol")
              ),
              eb.and([
                eb("paymentIban.specificSymbol", "is", null),
                eb("accountTransactionIban.specificSymbol", "is", null),
              ]),
            ])
          )
      )
      .innerJoin("payment", "payment.id", "paymentIban.id")
      .leftJoin(
        "reconciliationClaim",
        "reconciliationClaim.paymentId",
        "payment.id"
      )
      .select(["payment.id as paymentId"])
      .where("accountTransaction.id", "=", accountTransactionId)
      .where("accountTransaction.kind", "=", "iban")
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransactionIban.isDeleted", "is not", 1)
      .where("accountTransactionIban.variableSymbol", "is not", null)
      .where("paymentIban.isDeleted", "is not", 1)
      .where("payment.isDeleted", "is not", 1)
      .whereRef("payment.amount", "=", "accountTransaction.amount")
      .whereRef("payment.currency", "=", "accountTransaction.currency")
      .where("reconciliationClaim.id", "is", null)
      .orderBy("payment.id")
      .limit(1)
      .$narrowType<{
        paymentId: KyselyNotNull
      }>()
  )

export const cashRegisterReconciliationCandidateByAccountTransactionIdQuery = (
  accountTransactionId: AccountTransactionId
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin("paymentCashRegister", (join) =>
        join.onRef(
          "paymentCashRegister.accountId",
          "=",
          "accountTransaction.accountId"
        )
      )
      .innerJoin("payment", "payment.id", "paymentCashRegister.id")
      .leftJoin(
        "reconciliationClaim",
        "reconciliationClaim.paymentId",
        "payment.id"
      )
      .select(["payment.id as paymentId"])
      .where("accountTransaction.id", "=", accountTransactionId)
      .where("accountTransaction.kind", "=", "cashRegister")
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("paymentCashRegister.isDeleted", "is not", 1)
      .where("payment.isDeleted", "is not", 1)
      .whereRef("payment.amount", "=", "accountTransaction.amount")
      .whereRef("payment.currency", "=", "accountTransaction.currency")
      .where("reconciliationClaim.id", "is", null)
      .orderBy("payment.id")
      .limit(1)
      .$narrowType<{
        paymentId: KyselyNotNull
      }>()
  )

export const sparkReconciliationCandidateByAccountTransactionIdQuery = (
  accountTransactionId: AccountTransactionId
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionSpark",
        "accountTransactionSpark.id",
        "accountTransaction.id"
      )
      .leftJoin(
        "accountTransactionLightning",
        "accountTransactionLightning.id",
        "accountTransaction.id"
      )
      .leftJoin(
        "accountTransactionSparkInvoice",
        "accountTransactionSparkInvoice.id",
        "accountTransaction.id"
      )
      .innerJoin("paymentBtc", (join) =>
        join.onRef("paymentBtc.accountId", "=", "accountTransaction.accountId")
      )
      .leftJoin("paymentBtcLightning", (join) =>
        join
          .onRef("paymentBtcLightning.id", "=", "paymentBtc.id")
          .on("paymentBtcLightning.isDeleted", "is not", 1)
      )
      .leftJoin("paymentBtcSpark", (join) =>
        join
          .onRef("paymentBtcSpark.id", "=", "paymentBtc.id")
          .on("paymentBtcSpark.isDeleted", "is not", 1)
      )
      .innerJoin("payment", "payment.id", "paymentBtc.id")
      .leftJoin(
        "reconciliationClaim",
        "reconciliationClaim.paymentId",
        "payment.id"
      )
      .select(["payment.id as paymentId"])
      .where("accountTransaction.id", "=", accountTransactionId)
      .where("accountTransaction.kind", "=", "spark")
      .where("accountTransaction.currency", "=", "BTC")
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransactionSpark.isDeleted", "is not", 1)
      .where("paymentBtc.isDeleted", "is not", 1)
      .where("payment.isDeleted", "is not", 1)
      .whereRef("paymentBtc.amountSats", "=", "accountTransaction.amount")
      .where((eb) =>
        eb.or([
          eb.and([
            eb("accountTransactionLightning.isDeleted", "is not", 1),
            eb("paymentBtcLightning.lnInvoice", "is not", null),
            eb("accountTransactionLightning.lnInvoice", "is not", null),
            eb(
              "paymentBtcLightning.lnInvoice",
              "=",
              eb.ref("accountTransactionLightning.lnInvoice")
            ),
          ]),
          eb.and([
            eb("accountTransactionSparkInvoice.isDeleted", "is not", 1),
            eb("paymentBtcSpark.sparkInvoice", "is not", null),
            eb("accountTransactionSparkInvoice.sparkInvoice", "is not", null),
            eb(
              "paymentBtcSpark.sparkInvoice",
              "=",
              eb.ref("accountTransactionSparkInvoice.sparkInvoice")
            ),
          ]),
        ])
      )
      .where("reconciliationClaim.id", "is", null)
      .orderBy("payment.id")
      .limit(1)
      .$narrowType<{
        paymentId: KyselyNotNull
      }>()
  )
