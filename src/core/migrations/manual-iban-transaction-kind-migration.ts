import { type KyselyNotNull, ok, sqliteTrue } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AppMigration } from "@/core/migrations/migrations.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"

/**
 * Cash-kind transactions on a bank account. Shared by `hasWork` (one row is
 * enough) and `run` (all of them), so the two cannot disagree on what is
 * left to do.
 *
 * Nothing but `markPaymentPaidIban` ever wrote one: refunds write to the cash
 * register, and every other IBAN writer passes an `iban` detail, which sets
 * the kind. A cash movement on a bank account means nothing either way, so
 * the predicate needs no narrowing to the manual claim behind it.
 *
 * The account may be deleted: `accountDerivedIdMigration` tombstones every
 * legacy account and leaves its transactions pointing at it as history, and
 * those are exactly the older confirmations Activity still shows.
 */
const misfiledTransactionsQuery = (limit?: number) =>
  createQuery((db) => {
    const query = db
      .selectFrom("accountTransaction")
      .innerJoin("account", "account.id", "accountTransaction.accountId")
      .select("accountTransaction.id")
      .where("accountTransaction.kind", "=", "cashRegister")
      .where("accountTransaction.isDeleted", "is not", sqliteTrue)
      .where("account.kind", "=", "iban")
      .$narrowType<{ id: KyselyNotNull }>()
    return limit === undefined ? query : query.limit(limit)
  })

/**
 * Re-files hand-confirmed bank transfers as `iban` transactions.
 *
 * `markPaymentPaidIban` used to write them as `kind = "cashRegister"`: it has
 * no bank statement to fill an `iban` detail row from, and the kind fell back
 * to cash. Activity then said they were paid in cash, and the sales
 * statistics counted them into the cash drawer. Only the kind changes; the
 * ids stay, so a repeated confirmation still lands on the same row.
 *
 * Idempotent: a re-filed row no longer matches the query `hasWork` reads.
 */
export const manualIbanTransactionKindMigration: AppMigration = {
  name: "2026-10-10-manual-iban-transaction-kind",
  hasWork: async (run) =>
    ok(
      (await run.deps.evolu.loadQuery(misfiledTransactionsQuery(1))).length > 0
    ),
  run: async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const rows = await evolu.loadQuery(misfiledTransactionsQuery())
    if (rows.length === 0) return ok(undefined)

    await runMutationWithCompletion((options) => {
      for (const { id } of rows) {
        evolu.update(
          "accountTransaction",
          { id, kind: "iban" },
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })

    return ok(undefined)
  },
}
