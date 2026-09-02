import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
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
 * The most recent bills, newest first, regardless of status — the read
 * model behind the `/activity/bills` list. Mirrors `latestPaymentsQuery` in
 * `payment-history.tsx`: a flat, capped list for a history view, not a
 * lock/coverage computation.
 */
export const latestBillsQuery = createQuery((db) =>
  db
    .selectFrom("bill")
    .selectAll()
    .where("displayNumber", "is not", null)
    .where("currency", "is not", null)
    .where("createdAt", "is not", null)
    .$narrowType<{
      displayNumber: KyselyNotNull
      currency: KyselyNotNull
      createdAt: KyselyNotNull
    }>()
    .orderBy("createdAt", "desc")
    .limit(50)
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
