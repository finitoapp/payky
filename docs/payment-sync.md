# Payment sync (FIO, Spark, Cashu & LNURL verify)

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
| Manual pointer edit | Settings UI only | Settings UI + CLI (`apps/cli/src/cli-accounts.ts set/reset-spark-sync-pointer`) |

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
| `cashu` | account + mint + the payment's quote id, or the receive id it holds; never the amount | yes — the Cashu job |
| `lightningAddress` | not matched: the verify poll knows its payment and claims it directly | yes — the LNURL verify job, below |

No match = transaction stays unclaimed; not an error. A claim also refreshes
the bill's `closedAt` cache in the same batch (see `bill-payment-states.md`).

## Cashu

`background-jobs/jobs/cashu-account-sync-job.ts` serves the Cashu account
(`cashu.md` §5, the `cashu/` decisions). It runs on native and browser, not
in the CLI, and only while the Cashu account is enabled. The wallet is
Payky's own, its tables in the app database next to the books
(`cashu/0012`).

| Part | What it does |
|---|---|
| Lightning settlement | Polls each pending `topup` — a payment's, or a move's for a day — on a schedule from its creation: 5 s for 5 minutes, 1 minute up to an hour, then 5 minutes; a paid quote is claimed (`claimCashuTopup`). A claim another device makes is waited for; after 5 minutes it is reclaimed from the synced counter. |
| Melts | Melts this device sent that are still `pending` are resumed (`resumeCashuMelt`) with the settlement of the withdrawal or move that owns them, written in the same batch (`cashu/0014`). |
| Tokens | `background-jobs/jobs/cashu-token-listener.ts` reads 1:1 NIP-17 messages with a token (7-day window), matches them to a payment, makes the payment hold the receive id, and receives the token; a message whose mint is down is retried every 30 s. |
| Booking | A topup or receive is booked in the batch that completes it (`loadCashuBooking`, `upsertCashuBooking`): one `accountTransaction` (+ `accountTransactionCashu`) with the automatic claim, next to the proofs and `done`. Nothing is left to catch up (`cashu/0014`). |

Multi-device safety comes from the mint's answers and derived ids, not
locks: operation ids derive from the mint and quote (or the token text), the
claim stops when another device got there first (`cashu/0029`), and the
booked transaction's id derives from the operation id.

## LNURL verify

`background-jobs/jobs/lightning-address-verify-job.ts` settles payments
taken into the merchant's own wallet through a Lightning address (the
`lightning-address/` decisions). Nothing arrives from the wallet: Payky
asks. It runs on native and browser (the wallets answer cross-origin), not
in the CLI.

| Part | What it does |
|---|---|
| Work | `unsettledLightningAddressPaymentsQuery`: every `paymentLightningAddress` row without a preimage, on a payment not deleted and not claimed another way. A row is dropped a day after its invoice expired. |
| Poll | `syncLightningAddressPayment` asks the invoice's LUD-21 verify URL: first after 2 s, then doubling up to a minute, and at once on reconnect. The wait screen polls every 2 s besides. |
| Proof | Paid only when verify answers for the stored invoice with a preimage whose SHA-256 is its payment hash (`lightning-address/0002`); `settled` without one writes nothing and the wait screen warns. |
| Record | One batch: `accountTransaction` (kind `lightningAddress`, sats) + `accountTransactionLightning` (invoice, hash, preimage), the automatic claim and bill `closedAt`, and `paymentLightningAddress.preimage`. |

Multi-device safety comes from the ids, not locks: the transaction's id
derives from the account and the payment hash, the claim's from the payment
and the transaction, so two devices that saw the same preimage write the
same rows.

Which wallets reveal the preimage is known only from real payments. From
research before the implementation: Alby's callback
returns `verify` and allows any origin; Blink, Breez and Minibits answer
their metadata to any origin, Coinos echoes the origin. ZEUS Pay's verify
carries no preimage, so its payments never settle; Wallet of Satoshi is
expected to return no `verify` and be refused on save. None of these has
been tried against a real payment yet: record each one that is, here, not
in the UI.

## Known limitations

| # | Issue | Status |
|---|---|---|
| 1 | Spark transfer with no Lightning/Spark invoice | open by design — never recorded |
| 2 | Ambiguous candidate ties | open — `payment.id` order decides |

1. **By design**, not a bug: `assertHasSparkIdentifier` is a domain
   invariant enforced inside `createAccountTransaction` itself.

2. **Ties.** IBAN candidate: same VS/SS/amount on two open payments. Cash
   candidate: same amount (currently unreachable, see the table above).
