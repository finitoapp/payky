import {
  evoluJsonArrayFrom,
  type KyselyNotNull,
  sqliteTrue,
} from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import type { BillId } from "./bill-types.ts"

export const billByIdQuery = (idValue: BillId) =>
  createQuery((db) =>
    db
      .selectFrom("bill")
      .selectAll()
      .where("id", "=", idValue)
      .where("displayNumber", "is not", null)
      .where("currency", "is not", null)
      .$narrowType<{
        displayNumber: KyselyNotNull
        currency: KyselyNotNull
      }>()
  )

/**
 * A cheap, SQL-only approximation of "still open" for list views (the POS
 * floor overview, the assign-table dialog) — filters on the best-effort
 * `closedAt`/`canceledAt` cache fields instead of computing coverage for
 * every bill the account has ever had. See `bill.ts`'s doc comment and
 * docs/bill-payment-states.md: this can rarely under- or over-include a
 * bill for a moment after a multi-device race, which is why nothing that
 * needs to be *correct* (guards, the bill detail page) uses this — those
 * derive status live via `deriveBillStatus`/`loadBillStatus`.
 */
export const openBillsQuery = createQuery((db) =>
  db
    .selectFrom("bill")
    .selectAll()
    .where("canceledAt", "is", null)
    .where("closedAt", "is", null)
    .where("displayNumber", "is not", null)
    .where("currency", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
      currency: KyselyNotNull
    }>()
)

/**
 * Every open bill currently assigned to one table. Read by `deleteTable`:
 * the POS floor view only renders non-deleted tables plus the bills with no
 * table at all, so deleting an occupied table would leave its bill with no
 * tile to reach it from.
 */
export const openBillsByTableIdQuery = (tableId: TableId) =>
  createQuery((db) =>
    db
      .selectFrom("bill")
      .select(["id"])
      .where("tableId", "=", tableId)
      .where("canceledAt", "is", null)
      .where("closedAt", "is", null)
      .where("isDeleted", "is not", sqliteTrue)
  )

/**
 * A page of the most recent bills, newest first, regardless of status — the
 * read model behind the `/activity/bills` infinite-scroll list. Pass
 * `limit: pageSize + 1` and slice off the extra row to detect whether more
 * bills remain without a separate count query. Mirrors `latestPaymentsQuery`
 * in `payment-history.tsx`: a flat, paginated list for a history view, not a
 * lock/coverage computation.
 *
 * Embeds each bill's line ledger (`lines`) and claimed-transaction rows
 * (`claimedTransactions`) as `evoluJsonArrayFrom` subqueries instead of
 * making `BillHistory` load them per row via separate `billId`-scoped
 * queries (as `useBillLineSummaries`/`useBillCoverage`/`useBillStatus` do
 * for the single-bill detail page). Loading those per row — combined with
 * React's `use()` suspending on each newly-seen query — turned the list
 * into a sequential Suspense waterfall, one round trip per bill. Folding
 * the raw rows into this one query keeps the list to a single round trip
 * regardless of how many bills are shown; `deriveBillHistoryItemSummary` in
 * `bill-utils.ts` then re-derives status/coverage from `lines`/
 * `claimedTransactions` with the same pure logic the detail page uses.
 */
export const latestBillsQuery = ({ limit }: { readonly limit: number }) =>
  createQuery((db) =>
    db
      .selectFrom("bill")
      .selectAll()
      .select((eb) => [
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
            .whereRef("billLine.billId", "=", "bill.id")
            .where("billLine.billId", "is not", null)
            .where("billLine.itemId", "is not", null)
            .where("billLine.type", "is not", null)
            .where("billLine.kind", "is not", null)
            .where("billLine.quantity", "is not", null)
            .where("billLine.totalAmount", "is not", null)
            .orderBy("billLine.createdAt", "asc")
            .$narrowType<{
              billId: KyselyNotNull
              itemId: KyselyNotNull
              type: KyselyNotNull
              kind: KyselyNotNull
              quantity: KyselyNotNull
              totalAmount: KyselyNotNull
            }>()
        ).as("lines"),
        evoluJsonArrayFrom(
          eb
            .selectFrom("payment")
            .innerJoin("reconciliationClaim", (join) =>
              join
                .onRef("reconciliationClaim.paymentId", "=", "payment.id")
                .on("reconciliationClaim.isDeleted", "is not", 1)
            )
            .innerJoin(
              "accountTransaction",
              "accountTransaction.id",
              "reconciliationClaim.accountTransactionId"
            )
            .select([
              "payment.id as paymentId",
              "payment.tipAmount",
              "reconciliationClaim.accountTransactionId",
              "accountTransaction.amount",
            ])
            .whereRef("payment.billId", "=", "bill.id")
            .where("payment.isDeleted", "is not", 1)
            .where("payment.tipAmount", "is not", null)
            .where("reconciliationClaim.accountTransactionId", "is not", null)
            .where("accountTransaction.isDeleted", "is not", 1)
            .where("accountTransaction.amount", "is not", null)
            .$narrowType<{
              tipAmount: KyselyNotNull
              accountTransactionId: KyselyNotNull
              amount: KyselyNotNull
            }>()
        ).as("claimedTransactions"),
      ])
      .where("displayNumber", "is not", null)
      .where("currency", "is not", null)
      .where("createdAt", "is not", null)
      .$narrowType<{
        displayNumber: KyselyNotNull
        currency: KyselyNotNull
        createdAt: KyselyNotNull
      }>()
      .orderBy("createdAt", "desc")
      .limit(limit)
  )

/**
 * Every bill's `displayNumber`, oldest first, regardless of status — the
 * source `createBillAtEnd` derives the next sequential number from. Must
 * include closed/canceled bills too so numbers are never reused.
 */
export const allBillDisplayNumbersQuery = createQuery((db) =>
  db
    .selectFrom("bill")
    .select(["displayNumber"])
    .where("displayNumber", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
    }>()
    .orderBy("displayNumber", "asc")
)
