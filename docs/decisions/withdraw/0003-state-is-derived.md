# 0003 A withdrawal's state is derived, and failure is written only when certain

Status: accepted
Date: 2026-10-09

## Context

A stored status would need every writer to agree on transitions, across
devices that sync later. And telling the merchant "the money did not
leave" when it did invites paying twice.

## Decision

- Done: the account transaction `accountTransactionId` names exists,
  deleted or not (a deleted one is a bookkeeping edit, not money that
  stayed). Failed: `failedAt` is set. In progress: neither. A movement
  wins over `failedAt`.
- `failedAt` is always written with `failureReason`, and only when
  certain:
  - `rejected`: Lightning only, the SDK threw `SparkValidationError` and
    `getTransfer(transferId)` finds no transfer;
  - `returned`: the sync job sees a final Lightning failure
    (`LIGHTNING_PAYMENT_FAILED`, `USER_SWAP_RETURNED`); other statuses wait
    until mainnet confirms what they mean, and a returned Spark-fallback
    transfer waits likewise;
  - `not-created`: the transfer never appeared (withdraw/0007);
  - `manual`: the owner's "The money did not leave" on an on-chain
    withdrawal.
- On-chain, a `SparkValidationError` is never taken as a rejection: there
  is no transfer id to check, so the withdrawal stays uncertain for the
  owner to settle.
- The sync job checks a Lightning withdrawal for 17 days: the SDK's
  Lightning send expiry is 16 days, plus one. One withdrawal's failed lookup
  never stops the others.

## Alternatives considered

A stored status column: concurrent writers on two devices could leave it
contradicting the account transactions.

## Consequences

A withdrawal past 17 days without an outcome says "the result could not be
determined" and leaves it to the owner.

## Enforced by

- `src/core/modules/withdraw/withdraw-queries.test.ts > withdrawal queries > failedAt makes a withdrawal failed, with its reason`
- `src/core/modules/withdraw/withdraw-queries.test.ts > withdrawal queries > a deleted movement still makes the withdrawal done`
- `src/core/modules/withdraw/withdraw-actions.test.ts > on-chain resolution > a movement beats a manual failure`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > marks a rejected Lightning payment failed once no transfer exists`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > leaves a rejected Lightning payment uncertain when its transfer exists`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > leaves a rejected Lightning payment uncertain when the transfer lookup fails`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > leaves a rejected on-chain withdrawal uncertain`
- `src/core/modules/withdraw/withdraw-check-actions.test.ts > checkPendingWithdrawals > marks a final Lightning failure returned`
- `src/core/modules/withdraw/withdraw-check-actions.test.ts > checkPendingWithdrawals > leaves an unknown user request status alone`
- `src/core/modules/withdraw/withdraw-check-actions.test.ts > checkPendingWithdrawals > checks a withdrawal 15 days old, but not one 17 days old`
- `src/core/modules/withdraw/withdraw-check-actions.test.ts > checkPendingWithdrawals > keeps checking the others when one withdrawal's lookup fails`
- `src/core/modules/withdraw/withdraw-utils.test.ts > classifyPendingWithdrawal > leaves an unverified or unknown status %s alone`
