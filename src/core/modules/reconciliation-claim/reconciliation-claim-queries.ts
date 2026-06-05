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
      .innerJoin("paymentSpark", (join) =>
        join
          .onRef("paymentSpark.accountId", "=", "accountTransaction.accountId")
          .onRef(
            "paymentSpark.lnInvoice",
            "=",
            "accountTransactionSpark.lnInvoice"
          )
      )
      .innerJoin("payment", "payment.id", "paymentSpark.id")
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
      .where("paymentSpark.isDeleted", "is not", 1)
      .where("payment.isDeleted", "is not", 1)
      .whereRef("paymentSpark.amountSats", "=", "accountTransaction.amount")
      .where("reconciliationClaim.id", "is", null)
      .orderBy("payment.id")
      .limit(1)
      .$narrowType<{
        paymentId: KyselyNotNull
      }>()
  )
