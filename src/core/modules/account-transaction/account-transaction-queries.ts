import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type {
  NonEmptyString,
  NonEmptyString255,
} from "@/core/modules/shared/schema.ts"

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

export const accountTransactionIbanByBankReferenceQuery = (
  accountId: AccountId,
  bankReference: NonEmptyString255
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransactionIban")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "accountTransactionIban.id"
      )
      .selectAll()
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
      .where("bankReference", "=", bankReference)
      .where("bankReference", "is not", null)
      .$narrowType<{
        bankReference: KyselyNotNull
      }>()
  )
