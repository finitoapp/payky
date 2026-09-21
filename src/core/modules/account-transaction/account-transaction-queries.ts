import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type {
  CashuMintUrl,
  NonEmptyString,
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

export const accountTransactionCashuByQuoteIdQuery = ({
  mintUrl,
  quoteId,
}: {
  readonly mintUrl: CashuMintUrl
  readonly quoteId: NonEmptyString
}) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransactionCashu")
      .select(["id", "mintUrl", "quoteId"])
      .where("mintUrl", "=", mintUrl)
      .where("quoteId", "=", quoteId)
      .where("quoteId", "is not", null)
      .$narrowType<{
        quoteId: KyselyNotNull
      }>()
  )

/**
 * The cashu transaction a wallet `receive` operation already settled, so a
 * token replayed for another payment is recognized as the same money.
 */
export const accountTransactionCashuByReceiveOperationIdQuery = (
  receiveOperationId: NonEmptyString
) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransactionCashu")
      .select(["id", "mintUrl", "quoteId", "receiveOperationId"])
      .where("receiveOperationId", "=", receiveOperationId)
      .where("receiveOperationId", "is not", null)
      .$narrowType<{
        receiveOperationId: KyselyNotNull
      }>()
  )
