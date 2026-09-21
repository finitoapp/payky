# Payment sync (FIO & Spark)

How the FIO (bank IBAN) and Spark (Bitcoin/Lightning) background jobs turn
external activity into local data. Complements `docs/bill-payment-states.md`,
which covers what a `reconciliationClaim` means to a payment/bill; this
covers how one (and the `accountTransaction` behind it) gets created.

## Flow

Both jobs do the same two things per new item (FIO statement line / Spark
transfer) in one mutation batch:

1. **Find candidate** → match an unclaimed `payment` by method identifiers
   before writing, using the raw incoming item.
2. **Record + reconcile** → an `accountTransaction` row + kind detail row
   (`accountTransactionIban` / `accountTransactionSpark`+`Lightning`/
   `SparkInvoice`) plus the optional `reconciliationClaim` and bill
   `closedAt` cache. The claim makes a payment display **Paid**.

Already-recorded transactions still run the standalone reconciliation step to
repair rows created before this batching existed.

## Files

| File | Role |
|---|---|
| `background-jobs/background-job-types.ts` | `BackgroundJob`/`BackgroundJobContext` shape. |
| `background-jobs/background-jobs.ts` | Which jobs run on which runtime. |
| `background-jobs/run-background-jobs.ts` | Starts jobs, composes disposables. |
| `background-jobs/keyed-task-queue.ts` | Per-key sequential queue, used by every session below. |
| `background-jobs/reconcile-account-sync-sessions.ts` | Diffs active accounts/plugins against running sessions. |
| `background-jobs/jobs/fio-account-transaction-sync-job.ts` | The FIO job. |
| `background-jobs/jobs/spark-account-transaction-sync-job.ts` | The Spark job. |
| `account-transaction/account-transaction-actions.ts` | `createAccountTransaction` — the record step. |
| `reconciliation-claim/reconciliation-claim-actions.ts` | `reconcileAccountTransaction` — the reconcile step. |
| `integrations/fio/fio-client.ts` | FIO HTTP client. |
| `spark/spark-wallet.ts` | Pooled, ref-counted Spark SDK wrapper. |
| `account/account.ts`, `account-spark-queries.ts` | `sparkAccountSyncPointer` table + query. |
| `components/app/app-background-jobs.tsx` | Starts/stops jobs once per app mount. |

## Parameters

| | FIO | Spark |
|---|---|---|
| Trigger | per-plugin timer | account-wide timer + wallet events (`transfer:claimed`, `balance:update`, `deposit:confirmed`) |
| Default interval | 30s (`numberOfSecondsBetweenChecks`) | 60s (`DEFAULT_RECHECK_INTERVAL_MS`) |
| Sync pointer | `fioPluginSyncPointer.lastSyncedDate` | `sparkAccountSyncPointer.lastSyncedAt` |
| Lookback overlap | `syncLookbackDays`, default **1 day**, per-plugin | `SPARK_SYNC_LOOKBACK_HOURS` = **72h**, fixed |
| Cold-start scan | 2 months back (`FIO_FIRST_SYNC_LOOKBACK_MONTHS`) | unbounded (full history) |
| Advisory lock key | `fio-transaction-{accountId}-{bankReference}` | `spark-transfer-{id}` |
| Queue keys per session | `"sync"` (single) | `"history"` + `` `transfer:${id}` `` (multi) |
| Manual pointer edit | Settings UI only | Settings UI + CLI (`bin/cli-accounts.ts set/reset-spark-sync-pointer`) |

Both locks use `{ ifAvailable: true }` — skip on contention, never wait.
Both pointers are wall-clock values (sync start time), not derived from any
record's own timestamp, so a quiet sync still advances the window forward.

FIO only runs native/CLI (no CORS/proxy for browser); Spark runs everywhere.

## Multi-device & idempotency

A FIO plugin / Spark account is normal synced Evolu data — every device
independently runs its own sync job for it, with no leader election. Safety
comes from convergence, not coordination:

- `accountTransaction.id` derives from `accountId` + bank reference (FIO) or
  `sparkTransferId` (Spark) — two devices recording the same thing write the
  same CRDT row.
- `reconciliationClaim.id` derives from `` `{source}:${paymentId}:${accountTransactionId}` ``
  — same reasoning.
- The advisory locks above are **per-device only**; they mainly guard a
  session against itself (e.g. old/new session overlap after a token or
  secret change), not against other devices.

## Reconciliation

`reconcileAccountTransaction(id)`: return the existing claim if one's
active; else run these three candidate queries in parallel (`kind` picks at
most one winner) and claim the first match, ties broken by `payment.id`:

| Kind | Match | Reachable from these jobs? |
|---|---|---|
| `iban` | account + variable symbol (+ specific symbol, or both null) + amount + currency | yes |
| `spark` | account + `BTC` + amount(sats) + Lightning or Spark invoice match | yes |
| `cashRegister` | account + amount + currency | no — only `markPaymentPaidCash` creates this kind |

No match = transaction stays unclaimed; not an error. A claim also refreshes
the bill's `closedAt` cache in the same batch (see `bill-payment-states.md`).

## Known limitations

| # | Issue | Status |
|---|---|---|
| 1 | Create + reconcile aren't atomic | resolved |
| 2 | Lock-skipped item outside the lookback window | resolved |
| 3 | No backoff on FIO errors other than 409 | open |
| 4 | Spark transfer with no Lightning/Spark invoice | open by design — never recorded |
| 5 | Ambiguous candidate ties | open — `payment.id` order decides |
| 6 | Canceled-payment collision | open — resolved at display time only |
| 7 | Disposal doesn't await in-flight work | resolved |
| 8 | One throwing queue key stalls its siblings | open — Spark's multi-key queue only |

1. **Resolved.** The jobs compute the transaction id and find the candidate
   before one mutation batch writes the transaction, optional claim, and bill
   cache. The existing-row reconciliation retry remains for historical rows
   created before this change.

2. **Resolved.** If FIO skips a transaction because its advisory lock is
   held, it does not advance the sync pointer. The next interval retries the
   same window; already-recorded transactions remain deduplicated by bank
   reference.

3. **No backoff.** A `422` (FIO strong-auth required) or any other
   non-`409` failure retries at the plain check interval forever.

4. **By design**, not a bug: `assertHasSparkIdentifier` is a domain
   invariant enforced inside `createAccountTransaction` itself.

5. **Ties.** IBAN candidate: same VS/SS/amount on two open payments. Cash
   candidate: same amount (currently unreachable, see the table above).

6. **Canceled-payment collision.** None of the three candidate queries
   filter `canceledAt`. Same collision `bill-payment-states.md` documents
   for the manual path; resolved there by display precedence, not prevented
   here.

7. **Resolved.** Async disposal clears each queue's pending work and awaits
   the running item. FIO/Spark sessions propagate that wait, and the app
   waits for jobs before disposing their parent `Run`. Disposal remains
   graceful rather than interrupting an active network or database call.

8. **Multi-key queue stall.** `createKeyedTaskQueue`'s drain loop wraps its
   whole `while` in one `try`/`catch` — one throwing key aborts the loop,
   stranding sibling keys until something unrelated re-enqueues. FIO's
   queues only ever hold one key, so this doesn't bite there; Spark's
   per-account queue (`"history"` + `` `transfer:${id}` ``) can stall until
   the next recheck tick or event.
