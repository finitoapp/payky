import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { NonEmptyString } from "@/core/modules/shared/schema.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

export const accountTransactionSparkByTransferIdQuery = (
  sparkTransferId: NonEmptyString
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransactionSpark")
      .selectAll()
      .where("sparkTransferId", "=", sparkTransferId)
      .where("sparkTransferId", "is not", null)
      .$narrowType<{
        sparkTransferId: KyselyNotNull
      }>()
  )

/**
 * The money on one account transaction: what it was for, and in which
 * currency. Read by the manual-claim path, which is handed only a
 * transaction id but has to tell bill coverage what that claim is worth —
 * a satoshi settlement and a koruna one are not the same number. The sync
 * jobs pass the row they just computed instead of reading it back.
 */
export const accountTransactionAmountByIdQuery = (id: AccountTransactionId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .select(["accountTransaction.amount", "accountTransaction.currency"])
      .where("accountTransaction.id", "=", id)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransaction.amount", "is not", null)
      .where("accountTransaction.currency", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
      }>()
  )

/**
 * One account's latest transactions, newest first, for the read-only list
 * the withdrawal history points to for withdrawals made before it existed.
 */
// ponytail: fixed page of 200, page with useInfiniteEvoluQuery if accounts outgrow it
export const accountTransactionsByAccountQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .select([
        "accountTransaction.id",
        "accountTransaction.kind",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
      ])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("accountTransaction.amount", "is not", null)
      .where("accountTransaction.occurredAt", "is not", null)
      .where("accountTransaction.kind", "is not", null)
      .orderBy("accountTransaction.occurredAt", "desc")
      .limit(200)
      .$narrowType<{
        kind: KyselyNotNull
        amount: KyselyNotNull
        occurredAt: KyselyNotNull
      }>()
  )

/** Whether an account transaction exists, deleted or not. */
export const accountTransactionExistsQuery = (id: AccountTransactionId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .select(["accountTransaction.id"])
      .where("accountTransaction.id", "=", id)
  )
