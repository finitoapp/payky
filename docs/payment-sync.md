# Payment sync (FIO & Spark)

This document explains how the two account-transaction sync jobs — FIO (bank
IBAN statements) and Spark (Bitcoin/Lightning wallet transfers) — turn
external activity into local data, and catalogs the edge cases that follow
from that design. Read it before changing anything under
`src/core/background-jobs/`, `fio-plugin-actions.ts`/`fio-plugin-queries.ts`,
`account-transaction-actions.ts`, `reconciliation-claim-actions.ts`, or the
Spark sync pointer in `account.ts`/`account-spark-queries.ts`.

It complements `docs/bill-payment-states.md`: that document specifies what a
`reconciliationClaim` means to a payment's status and a bill's coverage; this
one specifies how a claim (and the `accountTransaction` behind it) gets
created in the first place.

## What a sync job produces

Both jobs do the same two-step thing for every piece of external activity
they see (a FIO statement line, a Spark transfer):

1. **Record** it as an `accountTransaction` row (plus a kind-specific detail
   row — `accountTransactionIban` or `accountTransactionSpark`/
   `accountTransactionLightning`/`accountTransactionSparkInvoice`). This is
   the raw ledger fact: money moved on this account, at this time, for this
   amount. It exists independently of any payment.
2. **Reconcile** it: look for an unclaimed `payment` whose method identifiers
   match (IBAN variable/specific symbol, Spark invoice, ...) and, if found,
   write a `reconciliationClaim` linking the two. This is what makes a
   payment display as **Paid** (see `docs/bill-payment-states.md`).

These are two separately-awaited writes, not one atomic batch — see
["Crash between create and reconcile"](#crash-between-create-and-reconcile)
below for what that implies.

## Where this lives

| File | Role |
|---|---|
| `src/core/background-jobs/background-job-types.ts` | The `BackgroundJob`/`BackgroundJobContext` shapes every job implements. |
| `src/core/background-jobs/background-jobs.ts` | Which jobs run on which runtime (`getBackgroundJobsForRuntime`). |
| `src/core/background-jobs/run-background-jobs.ts` | Starts a list of jobs and composes their disposables into one. |
| `src/core/background-jobs/keyed-task-queue.ts` | Per-key sequential async work queue, used by every job below. |
| `src/core/background-jobs/reconcile-account-sync-sessions.ts` | Shared diff/reconcile loop: keeps one child session per account/plugin in sync with a changing list. |
| `src/core/background-jobs/jobs/fio-account-transaction-sync-job.ts` | The FIO job. |
| `src/core/background-jobs/jobs/spark-account-transaction-sync-job.ts` | The Spark job. |
| `src/core/modules/account-transaction/account-transaction-actions.ts` | `createAccountTransaction` — the "record" step, shared by both jobs (and by manual paths like `markPaymentPaidCash`). |
| `src/core/modules/reconciliation-claim/reconciliation-claim-actions.ts` | `reconcileAccountTransaction` — the "reconcile" step. |
| `src/core/integrations/fio/fio-client.ts` | The FIO HTTP client (statement fetch, token handling, error types). |
| `src/core/spark/spark-wallet.ts` | The pooled, ref-counted Spark SDK wrapper (`createSharedSparkSyncWallet`). |
| `src/core/modules/account/account.ts` | The `sparkAccountSyncPointer` table (mirrors `fioPluginSyncPointer` in `fio-plugin.ts`). |
| `src/core/modules/account/account-spark-queries.ts` / `account-actions.ts` | `sparkAccountSyncPointerByAccountIdQuery`, `updateSparkAccountSyncPointer` — the manual-override path (settings UI, CLI) for that pointer. |
| `src/components/app/app-background-jobs.tsx` | Where the jobs actually get started/stopped, once per app mount. |

## Runtime & lifecycle

`getBackgroundJobsForRuntime(isNativePlatform)` decides which jobs run:

- **Native (Capacitor/Android/iOS) and CLI:** both FIO and Spark.
- **Browser/PWA:** Spark only. A browser can't call the FIO API directly (no
  CORS, no server-side proxy for it), which is exactly what the FIO settings
  screen's `settings.fioPlugin.nativeRuntimeWarning` copy tells the user.

`AppBackgroundJobs` (mounted once by `App.tsx`) creates one root `Run` per app
session — with `navigator.locks` as the `LockManagerDep` in the browser/app,
or `in-process-lock-manager.ts` for the CLI — and calls `runBackgroundJobs`
with the runtime's job list. `runBackgroundJobs` starts each job's `Task` in
order, collects the `AsyncDisposable` each one returns into a single
`AsyncDisposableStack`, and — if starting any job throws — unwinds every job
already started before rethrowing, so a failing job doesn't leave earlier
ones running unsupervised.

On unmount, the effect disposes the jobs' combined disposable and separately
disposes the root `Run`. Both disposals are fire-and-forget from the
component's point of view (errors go through `console.error`, not a thrown
promise) — see ["Disposal doesn't wait for in-flight
work"](#disposal-doesnt-wait-for-in-flight-work) for what that means in
practice.

## The multi-device concurrency model

**This is the framing fact behind almost every design choice below.** A FIO
plugin or Spark account is ordinary Evolu data, synced through the same
`evoluOwnerId` as everything else. If a business runs this app on two
tablets, both devices see the same FIO plugin / Spark account and **both
independently start their own sync job for it** — there is no single device
that "owns" the sync. Nothing coordinates across devices at the network or
process level; there is no leader election for this like there is for the
local-first SQLite writer.

The design copes with this by making every write **idempotent and
convergent** rather than trying to prevent concurrent attempts:

- `accountTransaction.id` is derived deterministically from identifying data
  — `accountId` + bank reference for IBAN, `sparkTransferId` for Spark (see
  `deriveAccountTransactionId` in `account-transaction-actions.ts`). Two
  devices recording the same statement line or transfer write to the *same*
  CRDT row, not two rows.
- `reconciliationClaim.id` is likewise deterministic
  (`` `reconciliationClaim:automatic:${paymentId}:${accountTransactionId}` `` /
  `` `reconciliationClaim:manual:${paymentId}:${accountTransactionId}` ``), so
  two devices independently reconciling the same pair converge on the same
  claim row instead of duplicating it.
- The per-item advisory lock each job takes (`fio-transaction-{accountId}-{id}`,
  `spark-transfer-{id}`, both `{ ifAvailable: true }`) is **per-device only**
  — `navigator.locks` doesn't coordinate across devices. It mainly protects
  against a single device racing itself (see the next point), not against two
  devices. Cross-device races are expected and resolved by convergence, not
  prevented by the lock.
- Within one device, the lock mostly matters when a session is torn down and
  recreated while work is still in flight (a FIO token added/removed, a Spark
  account's secret changed, or a fast unmount/remount) — see ["Disposal
  doesn't wait for in-flight work"](#disposal-doesnt-wait-for-in-flight-work).
  Each job otherwise serializes its own work through a single-key queue, so a
  healthy, undisturbed session never actually contends its own lock.

## Shared building blocks

- **`BackgroundJob`** (`background-job-types.ts`) is an Evolu
  `Task<AsyncDisposable, never, BackgroundJobContext>` — starting a job never
  fails outward (`never` error); it either starts and returns something
  disposable, or throws (a genuine bug, not a modeled failure).
  `BackgroundJobContext` bundles `EvoluDep`, `EvoluOwnerIdDep`, `ConsoleDep`,
  `DateDep`, `FetchDep`, `LockManagerDep`, and `BackgroundJobOnErrorDep`
  (`onError`) — jobs get every effect through this context, never through
  ambient globals like `navigator.locks` directly.
- **`createKeyedTaskQueue`** — a per-key queue: work enqueued under a key
  that's already pending *replaces* the pending work (last one wins), while
  different keys run one after another, in first-enqueued order. Every
  session in both jobs uses one of these to serialize its own work (a
  `FioPluginSync`'s single `"sync"` key; a Spark session's `"history"` and
  `` `transfer:${id}` `` keys). See ["One throwing key can stall a
  multi-keyed queue"](#one-throwing-key-can-stall-a-multi-keyed-queue) for a
  sharp edge in its error handling.
- **`reconcileAccountSyncSessions`** — the shared diff loop both jobs use to
  keep a `Map` of child sessions (one per FIO plugin / Spark account) in sync
  with the current list of active ones: sessions for accounts that
  disappeared are disposed, sessions for accounts whose relevant fields
  changed are disposed and recreated, sessions for new accounts are created.
  Each job supplies its own `matches()` to decide what "changed" means.

## FIO sync — walkthrough

`FioAccountTransactionSync` (created once by
`createFioAccountTransactionSyncJob`) is the top-level object: it subscribes
to `activeFioPluginsQuery` and re-runs `refreshPlugins()` (through its own
`"refresh"`-keyed queue) whenever that query's result changes.

`refreshPlugins()` loads all `fioPlugin` rows that pass
`activeFioPluginsQuery` (joined to an IBAN account, with `isActive`,
`numberOfSecondsBetweenChecks`, and `syncLookbackDays` all set), filters to
ones that actually have a token (`hasFioTokens`), and hands the result to
`reconcileAccountSyncSessions`, keyed by plugin id.

A plugin's session (`FioPluginSync`) is recreated — old one disposed, new one
built from scratch — whenever `matches()` says it should be, which compares
`accountId`, `numberOfSecondsBetweenChecks`, `syncLookbackDays`, `iban`, and
the **token set** (`areTokensEqual`). Note that `activeFioPluginsQuery` orders
tokens by `(createdAt, ownerId)` specifically so the token array is stable
across reads when nothing actually changed — an unstable order would restart
the session (and fire an extra request against a rate-limited API) for no
reason.

Each `FioPluginSync`:

- Runs a `setInterval` at `plugin.numberOfSecondsBetweenChecks` (default 30s,
  set in the settings UI) that queues a sync via its own single-key
  (`"sync"`) queue — so a slow sync never overlaps the next scheduled one; it
  coalesces instead.
- **Resolves the sync period** (`getSyncPeriod`): `to` is always today (the
  local calendar day). `from` is either the first-sync default —
  `FIO_FIRST_SYNC_LOOKBACK_MONTHS` (2 months) back — or, once a
  `fioPluginSyncPointer` exists, `lastSyncedDate - syncLookbackDays` (default
  1 day, `defaultFioPluginSyncLookbackDays`). This trailing overlap is
  deliberate: a statement line that posts late, or a device that was offline,
  still gets picked up on the next sync, at the cost of re-downloading (and
  re-filtering) a day's worth of already-recorded lines every single time.
  Both `from`/`to` and the stored pointer are computed on the **local**
  clock — `dateToDateString`/`dateStringToDate` are documented inverses for
  exactly this reason (see the comment above them in the source).
- **Fetches** one statement via `fetchFioTransactionsByPeriod`, consuming one
  token from the plugin's round-robin rotation (`createFioApiDep`) per sync
  tick — so with N tokens, the effective per-token check interval is N times
  the configured one (this is why the settings UI lets a plugin hold more
  than one token: to reduce load per token against FIO's per-token rate
  limit).
  - A `409` (`FioRateLimitError`) is logged and the sync ends there — no
    throw, and the sync pointer is **not** advanced, so the same period is
    retried on the next tick.
  - A returned statement for a different IBAN than the plugin's configured
    one is logged and skipped, pointer untouched — this is what a
    misconfigured or reused token looks like.
  - Any other failure (`FioApiError`, `FioHttpError`,
    `FioStrongAuthorizationRequiredError` for a `422`, or a network
    `FetchError`) is thrown, caught by the sync queue, and reported through
    `context.onError` — see ["No backoff for
    non-rate-limit errors"](#no-backoff-for-non-rate-limit-errors).
- **Filters** the downloaded transactions (`getTransactionsToRecord`):
  dedupes by bank reference against both the current download batch and
  everything already stored for this account
  (`existingFioTransactionBankReferencesQuery`), splitting the result into
  `toRecord` (genuinely new) and `toReconcile` (already recorded — retried
  for reconciliation only, see below).
- **Records** each new transaction (`recordTransaction`): takes an advisory
  lock keyed by `fio-transaction-{accountId}-{bankReference}` with
  `{ ifAvailable: true }` (skip rather than wait — see ["Lock-skipped
  transactions older than the lookback window are lost
  forever"](#lock-skipped-transactions-older-than-the-lookback-window-are-lost-forever)),
  computes `occurredAt` as **local midnight** of the FIO-reported booked date
  (FIO gives no time of day, only a date), then calls `createAccountTransaction`
  followed by `reconcileAccountTransaction`.
- **Retries reconciliation** for every already-recorded transaction the
  current window re-downloaded (`toReconcile`), in case a previous sync
  recorded it but never got to reconcile it — see ["Crash between create and
  reconcile"](#crash-between-create-and-reconcile).
- **Saves the sync pointer** (`fioPluginSyncPointer.lastSyncedDate = period.to`)
  once the loop above finishes, unless the session was disposed mid-loop.

## Spark sync — walkthrough

`createSparkAccountSyncManager` is the top-level object: it subscribes to
`activeSparkAccountsQuery` (every non-deleted Spark account — there is no
per-account pause flag the way FIO has `isActive`) and refreshes sessions the
same way the FIO job does, keyed by account id. A session's only "did this
change" check (`matches`) is whether the account's `secret` is still the
same one the session was built with.

A `recheckTimer` (default 60s, `DEFAULT_RECHECK_INTERVAL_MS`, overridable
through the job's own options but not exposed in any settings UI) queues a
full history sync for **every** currently active session on a fixed cadence,
independent of wallet events — a belt-and-braces net against a missed SDK
event. See ["Bounding the periodic
rescan"](#bounding-the-periodic-rescan) for how big that sync actually is.

Each account session (`createSparkAccountSyncSession`):

- Lazily acquires a pooled, ref-counted Spark SDK wallet instance the first
  time it's needed (`walletFactory`/`createSharedSparkSyncWallet` —
  `src/core/spark/spark-wallet.ts`), keyed by mnemonic, shared with every
  other consumer of the same account (domain actions, UI reads). The
  instance itself is only torn down once every lease — including this job's
  long-held one — has released it. Work requested before the wallet finishes
  initializing (`syncTransferSoon`/`syncHistorySoon` calls that arrive during
  `init()`) is buffered (`pendingTransferIds`/`pendingHistorySync`) and
  flushed once it's ready.
- Subscribes to three wallet events: `transfer:claimed` queues a **targeted**
  sync for just that transfer id (`syncTransferById` — fetches one transfer,
  records it); `balance:update` and `deposit:confirmed` both queue a **full**
  history sync.
- **Full history sync** (`syncHistory`): pages through the wallet's transfer
  list via `getTransfers(50, offset, createdAfter)`, running every transfer
  through `recordTransfer`, until a page comes back empty or the SDK stops
  advancing the offset. `createdAfter` bounds the sweep on every sync after
  the first — see ["Bounding the periodic
  rescan"](#bounding-the-periodic-rescan) for how, and for the one thing this
  doesn't cover.
- **Saves the sync pointer** (`sparkAccountSyncPointer.lastSyncedAt =`
  the moment the sweep *started*, mirroring FIO's `saveSyncPointer`) once the
  loop above finishes, unless the session was disposed mid-sweep.
- **`recordTransfer`** is the Spark equivalent of FIO's `recordTransaction`:
  - Ignores anything that isn't `TRANSFER_STATUS_COMPLETED` with a positive
    value (`shouldRecordTransfer`) — pending, failed, and zero-value
    transfers are never recorded.
  - Takes an advisory lock keyed by `spark-transfer-{id}`, `{ ifAvailable:
    true }`.
  - Checks `accountTransactionSparkByTransferIdQuery` for an existing row by
    `sparkTransferId`. If one exists, it **retries reconciliation** for that
    existing row and returns `"duplicate"` — see ["Crash between create and
    reconcile"](#crash-between-create-and-reconcile).
  - Otherwise builds the transaction input (`createSparkTransactionInput`):
    amount is `totalValue` signed by direction (negative for `OUTGOING`),
    `occurredAt` from `updatedTime ?? createdTime ?? now`, and a Lightning
    payload (invoice/preimage/payment hash) parsed out of `userRequest` when
    present. **A transfer with neither an `lnInvoice` nor a `sparkInvoice`
    fails this step and is silently ignored** — see ["Transfers with no
    Lightning or Spark invoice never enter the
    ledger"](#transfers-with-no-lightning-or-spark-invoice-never-enter-the-ledger).
  - Calls `createAccountTransaction` then `reconcileAccountTransaction`, same
    as FIO.

## Reconciliation: matching a transaction to a payment

`reconcileAccountTransaction(accountTransactionId)` is shared by both jobs
(and by nothing else — see the note under ["Cash-register candidate is
unreachable from these two
jobs"](#cash-register-candidate-is-unreachable-from-these-two-jobs)):

1. If an active `reconciliationClaim` already exists for this account
   transaction, return its `paymentId` immediately. This is what makes
   calling it again for an already-claimed row cheap — the retry paths above
   lean on this.
2. Otherwise, run three candidate queries **in parallel** — one per
   `accountTransaction.kind` (`iban`, `spark`, `cashRegister`). `kind` is a
   single non-nullable enum, so at most one of the three can ever return a
   row for a given transaction; they're asked together rather than in
   sequence purely to save round trips, not because more than one could win.
   - **IBAN candidate:** same account, matching variable symbol (plus a
     matching specific symbol, or both null), same amount and currency, and
     the payment not already claimed by anyone else.
   - **Spark candidate:** same account, `spark` kind, `BTC` currency, same
     amount (sats), and either the Lightning invoice or the Spark invoice
     matches, unclaimed.
   - **Cash-register candidate:** same account, `cashRegister` kind, same
     amount and currency, unclaimed. See the note below — this one can't
     actually be hit by either sync job.
   - Each query orders by `payment.id` and takes the first match. Two
     otherwise-identical open payments (same VS/SS/amount, or same
     amount/currency for cash) are disambiguated only by which payment id
     sorts first — see ["Ambiguous candidate matching"](#ambiguous-candidate-matching).
3. On a match, writes the claim (`writeClaimAndCloseBillIfCovered`) and, in
   the *same* mutation batch, refreshes the bill's `closedAt` cache if this
   claim now fully covers it. See `docs/bill-payment-states.md` for what that
   cache is for and its consistency guarantees.
4. No match just means the account transaction sits unclaimed — an entirely
   normal outcome (an unrelated incoming transfer, a manual top-up) that
   produces no user-facing signal until a matching payment shows up later
   and a future reconciliation attempt (a later transaction on the same
   bank reference doesn't retrigger this — see the retry mechanisms above)
   claims it.

### Cash-register candidate is unreachable from these two jobs

The cash-register candidate query is real and runs on every call to
`reconcileAccountTransaction`, but neither FIO nor Spark ever creates a
`cashRegister`-kind `accountTransaction` — FIO's rows are always `iban` kind,
Spark's are always `spark` kind (`deriveAccountTransactionKind` picks the
kind from whichever detail object is present). A `cashRegister`-kind
transaction only comes from a different, manual code path
(`markPaymentPaidCash`), which claims its payment directly rather than
through this candidate search. The cash-register ambiguity described in
["Ambiguous candidate matching"](#ambiguous-candidate-matching) is real code,
but it is dormant as far as this document's two jobs are concerned.

## Idempotency & identity

This is what makes every retry path above ("sync again next tick", "retry
reconciliation for an existing row", "two devices sync the same account")
safe rather than duplicating data:

- `accountTransaction.id` is deterministic — derived from `accountId` +
  bank reference (IBAN) or from `sparkTransferId` (Spark). Calling
  `createAccountTransaction` again with the same identifying values is a
  no-op upsert onto the same CRDT row, not a new row.
- `reconciliationClaim.id` is deterministic —
  `` `reconciliationClaim:automatic:${paymentId}:${accountTransactionId}` ``
  for the auto path both jobs use,
  `` `reconciliationClaim:manual:${paymentId}:${accountTransactionId}` `` for
  the manual one. Same reasoning.

## Edge cases & known limitations

### Crash between create and reconcile

`createAccountTransaction` and `reconcileAccountTransaction` are two
separately-awaited mutation batches, not one. If the process dies, throws, or
is killed between them (Android backgrounding a WebView mid-sync, an
unrelated bug in the candidate queries, ...), the account transaction is
committed but never claimed.

Both jobs mitigate the *visibility* half of this: instead of silently
skipping an already-recorded row on the next sync, they retry
`reconcileAccountTransaction` for it (FIO via the `toReconcile` list, Spark
via `recordTransfer`'s existing-row branch), and rely on
`reconcileAccountTransaction`'s own already-claimed check to make that a
single cheap read once a claim exists. This does **not** remove the crash
window itself — the two writes are still not atomic — it only ensures a
transaction stuck mid-way self-heals on the next sync instead of being
permanently and silently unreconciled. Removing the window entirely would
mean folding both writes into one batch, which would need the reconciliation
candidate lookup restructured to run on the transaction's own values instead
of an already-persisted row (the candidate queries currently join against
`accountTransaction` by id) — a larger change than either sync job alone
warrants.

`markPaymentPaid` (`payment-actions.ts`) had the identical shape and *was*
fixed this way, since its claim is always for one already-known `paymentId`
with no candidate search to restructure:
`computeAccountTransactionRows`/`upsertAccountTransactionRows`
(`account-transaction-actions.ts`) and
`loadBillClosedAtForPayment`/`upsertReconciliationClaimRows`
(`reconciliation-claim-actions.ts`) split each write into a compute/load step
and a plain-upsert step, so the caller can run both computations up front and
commit everything in one batch. Reusable in principle, but a genuine fix here
would still need the *search* — not just the write — to run before that
batch opens, which these two building blocks don't address by themselves.

### Lock-skipped transactions older than the lookback window are lost forever

`recordTransaction`/`recordTransfer` use `{ ifAvailable: true }` locks: on a
miss, they skip the item entirely rather than waiting, with no separate
tracking of what was skipped. For FIO specifically, this interacts with the
sync pointer: `saveSyncPointer` advances unconditionally after the loop, and
the next sync's `from` is `lastSyncedDate - syncLookbackDays` (default 1
day). As long as syncs keep happening roughly every `syncLookbackDays`, a
skipped statement line stays inside the re-fetched window and gets a second
chance. But if the device goes offline (or the app stays closed) for longer
than that after the skip, the next sync's window starts from *today*, and the
old, skipped line falls outside `syncLookbackDays` entirely — it is never
retried again, with nothing surfaced beyond a `debug`-level log line at the
time it happened.

### No backoff for non-rate-limit errors

Only the FIO `409` (rate limit) gets special handling. A `422`
(`FioStrongAuthorizationRequiredError` — the token needs re-approval in FIO's
web banking) or any other failure is thrown, reported through `onError`, and
retried at the plugin's ordinary fixed interval — every 30 seconds by
default — with no backoff. A token stuck needing re-authorization produces a
steady stream of reported errors until someone fixes it in FIO's portal.

### Bounding the periodic rescan

**Resolved.** `syncHistory` used to always start at `offset = 0` and walk the
*entire* transfer list on every sync — triggered by the 60-second recheck
timer for every active account, and by `balance:update`/`deposit:confirmed`
events on top of that — with cost growing linearly with the account's
lifetime transfer count, forever. It now reads a per-account high-water mark
(`sparkAccountSyncPointer.lastSyncedAt`, a new table mirroring FIO's
`fioPluginSyncPointer`) and passes `createdAfter = lastSyncedAt -
SPARK_SYNC_LOOKBACK_HOURS` (72h) to `getTransfers`, so every sync after the
first only walks a bounded recent window instead of the account's whole
history. The pointer is only ever missing on a genuinely first-ever sync,
which still scans unbounded — same trade-off FIO makes with its own
`FIO_FIRST_SYNC_LOOKBACK_MONTHS`.

The lookback window exists for the same reason FIO's does (a device offline
for a while), plus one Spark-specific reason FIO doesn't have: a transfer's
own `createdTime` — what the SDK's `createdAfter` filters on — can predate
when it actually finishes. An on-chain deposit is created, then sits pending
until `deposit:confirmed` fires, possibly hours later; a watermark built from
*when it was last seen* rather than *the clock* would permanently exclude a
transfer that was already old when it finally completed. 72 hours is a
deliberately generous, hardcoded guess at how long that gap can be — there's
no measured SLA behind it, so treat it as a starting point, not a verified
bound.

`sparkAccountSyncPointer.lastSyncedAt` is also editable through the Spark
account settings card (`InlineEditField`, day granularity) and through
`bin/cli-accounts.ts`'s `set-spark-sync-pointer`/`reset-spark-sync-pointer` —
mainly to force a wider rescan for support/debugging. Its effective window is
narrow while the account is actually active, though: every successful
`syncHistory` run — including one triggered moments later by a real wallet
event or the next 60-second tick — overwrites it with "now" again, so a
manual edit only has a real chance to matter if it lands right before the
one sweep it's meant to widen.

### Transfers with no Lightning or Spark invoice never enter the ledger

`createSparkTransactionInput` requires at least one of `lnInvoice` or
`sparkInvoice`; without either it returns `"missing-spark-identifier"` and
`recordTransfer` logs it at `debug` and drops it — no `accountTransaction`
row is written at all. This mirrors a real domain invariant
(`assertHasSparkIdentifier` in `spark-details.ts`, enforced inside
`createAccountTransaction` itself, not just a job-level choice), so it is not
a bug to "fix" locally — but it does mean a completed Spark transfer that
carries neither identifier (some raw Spark-to-Spark movements) is invisible
in the account's transaction history, with no trace beyond a debug log line.

### Ambiguous candidate matching

The IBAN and cash-register candidate queries (the cash one dormant per
above) both resolve ties with `orderBy(payment.id).limit(1)` when more than
one open, unclaimed payment matches on the join key. Two unresolved IBAN
payments sharing the same variable symbol, specific symbol, amount, and
currency — or, if the cash path is ever wired through this function, two
open cash payments of the same amount — are indistinguishable, and the claim
lands on whichever payment id happens to sort first. The Spark candidate is
narrower (it additionally requires an exact invoice match) so this is much
less likely to matter there.

### Canceled-payment collision

None of the three candidate queries filter out payments with `canceledAt`
set. A statement line or transfer whose identifiers match a payment that was
since canceled on another device can still be auto-claimed onto it. This is
the same collision `docs/bill-payment-states.md` documents for the manual
path — resolved at *display* time by that document's precedence rules (an
explicit cancellation still shows as Canceled; the money still counts toward
the bill's coverage), not prevented at reconciliation time.

### Disposal doesn't wait for in-flight work

**Partially resolved.** `createKeyedTaskQueue`'s `[Symbol.dispose]` still
only flips a flag and clears pending work — it cannot interrupt an `await
currentWork()` already running, and disposing a session still doesn't wait
for the queue's own drain loop to actually stop. That half is unchanged.

What changed: `createAccountTransaction`/`reconcileAccountTransaction` (and
FIO's per-tick statement fetch) used to run through a `createRun(...)` call
per invocation — a detached root outside any tracked tree, invisible to
disposal no matter what was in flight, and never disposed itself (`createRun`
is documented for composition roots only, one per app, not one per
transaction). Both jobs now compose through one `run.create()` scope per job
instead (held as `jobRun`, disposed via an `AsyncDisposableStack` alongside
the job's own session teardown), and every one of those calls is a real
child Task of it.
Evolu's own disposal semantics for a `DisposableRun` say async disposal
"aborts running Tasks... and waits for running Tasks to settle" — so
disposing `jobRun` now does wait for whatever `createAccountTransaction`/
`reconcileAccountTransaction` call happens to be in flight at that exact
moment, where before there was nothing tying it to disposal at all.

What this doesn't cover: disposal order still runs the queue's own
`[Symbol.dispose]` first, which only flips its flag — the *outer*
`syncTransactions`/`recordTransfer`/`syncHistory` function bodies (the loops,
the logging, the lock acquisition between child-Task calls) aren't
themselves Tasks `jobRun` tracks, so there's nothing for `jobRun`'s disposal
to wait for during those stretches. If the queue's drain loop reaches a
*new* child-Task call after `jobRun` is already disposed, that call now
throws (`assertNotDisposed`) instead of silently writing — reported through
`onError` rather than invisible, which is a real improvement in
observability, but not the same as disposal blocking until the whole session
is quiescent. The same-device race this section originally described — a
session recreated by `reconcileAccountSyncSessions` (a FIO token added, a
Spark account's secret rotated) racing its predecessor's in-flight write —
is narrowed by this, not eliminated.

### One throwing key can stall a multi-keyed queue

`createKeyedTaskQueue`'s internal drain loop wraps its *entire* `while` in
one `try`/`catch` — the first `await currentWork()` that throws exits the
loop immediately, leaving any other keys already queued behind it
unprocessed until something unrelated calls `enqueue()` again and restarts
the drain. FIO's queues only ever hold one key at a time (`"sync"` or
`"refresh"`), so this doesn't bite there. A Spark account session's queue
does hold multiple keys at once (`"history"` plus one
`` `transfer:${id}` `` per pending event) — a thrown error from one stalls
the rest until the next recheck-timer tick or wallet event happens to
re-enqueue something. Bounded by that timer (60s default), not unbounded,
but not instantaneous either.

## Tests

- `src/core/background-jobs/jobs/fio-account-transaction-sync-job.test.ts` —
  end-to-end against a fake FIO HTTP fetch: token rotation, rate limiting,
  IBAN mismatch, sync-pointer/lookback math, and the reconciliation-retry
  path.
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts` —
  end-to-end against a fake `SparkWallet` (`FakeSparkWallet`): history sync,
  live event-driven sync, listener cleanup on dispose, and the
  reconciliation-retry path.
- `src/core/background-jobs/keyed-task-queue.test.ts` — the queue's own
  coalescing/ordering/error semantics in isolation.
- `src/core/background-jobs/reconcile-account-sync-sessions.test.ts` — the
  shared session-diffing loop in isolation.
- `src/core/modules/reconciliation-claim/reconciliation-claim-actions.test.ts` —
  `reconcileAccountTransaction`'s candidate matching for all three kinds, in
  isolation from either sync job.
