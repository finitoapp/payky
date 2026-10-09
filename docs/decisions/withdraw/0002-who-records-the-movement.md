# 0002 Who records a withdrawal's account transaction

Status: accepted
Date: 2026-10-09

## Context

A Lightning payment over the SSP is only proven by its preimage, and a
payment over a Spark fallback completes only once the recipient claims it;
either can still come back. An on-chain exit has no transfer the Spark
sync job records at all.

## Decision

| Route | Writer | When |
|---|---|---|
| Lightning over the SSP | the Spark sync job only (`source: "auto"`) | the transfer is completed and its request carries a preimage |
| Lightning over a Spark fallback | the Spark sync job only | the transfer is completed (claimed) |
| On-chain | the withdrawal action; after a crash, the owner's "The money left" | right after sending |

- The sync job reads an outgoing Lightning send request (invoice at the top
  level, preimage required); without a preimage the transfer is skipped and
  a later pass records it. Amounts come from `valueSentByWallet` /
  `valueReceivedByWallet`; `totalValue` is deprecated.
- After every history sweep, and on its own every 10 seconds, the sync job
  runs the withdrawal check (withdraw/0003), which hands back the
  withdrawals' transfers to record, independent of the sweep's 72-hour
  window. The frequent check is what lets a merchant watching the detail
  see the outcome within seconds; without pending withdrawals it is one
  local query.
- A Spark account transaction may carry only its `sparkTransferId` (a
  payment over a bare Spark fallback has no invoice), but only the
  withdrawal check records such a transfer; the sweep keeps skipping them.
- "The money left" writes the on-chain movement under the withdrawal's own
  `accountTransactionId`, with `coopExitRequestId` and `txid` unknown
  (now nullable), and leaves an existing movement alone.

## Alternatives considered

Recording a Spark-fallback payment from the withdrawal action right after
sending: the movement would stay even if the unclaimed transfer came back,
and the action would need a lock against the sync job writing the same
transfer.

## Consequences

The detail reads a missing on-chain `txid` from the SDK for display only;
nothing writes it back, since that would add a second writer.

## Enforced by

- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > records an outgoing Lightning payment with its preimage once, fee included, under its transfer id`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > skips an outgoing Lightning payment without a preimage`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > records a bare Spark-fallback withdrawal through the withdrawal check, once`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > records a Spark-fallback withdrawal with a Spark invoice once, between the sweep and the check`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > records a Lightning withdrawal whose transfer is older than the sweep's window`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job, withdrawals > checks a withdrawal made after the sweep without waiting for the next one`
- `src/core/background-jobs/jobs/spark-account-transaction-sync-job.test.ts > spark account transaction sync job > ignores completed Spark transfers without a Spark or BOLT11 invoice`
- `src/core/modules/withdraw/withdraw-actions.test.ts > on-chain resolution > “the money left” records the movement with the amount and the quoted fee`
- `src/core/modules/withdraw/withdraw-utils.test.ts > classifyPendingWithdrawal > records a completed Spark fallback payment`
- `src/core/modules/withdraw/withdraw-utils.test.ts > classifyPendingWithdrawal > waits for a completed SSP payment without a preimage`
- `src/core/modules/withdraw/withdraw-utils.test.ts > classifyPendingWithdrawal > waits for a completed SSP payment whose user request is still missing`
