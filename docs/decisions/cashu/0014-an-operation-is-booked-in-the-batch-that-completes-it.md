# 0014 An operation is booked in the batch that completes it

Status: accepted
Date: 2026-10-28

## Context

`cashu/0005` booked every incoming operation of the wallet shared with
Linky, whoever performed it, by following a cursor over Evolu's internal
`evolu_history`. With a wallet of Payky's own in the app database
(cashu/0012), Payky is the only writer of its operations, a receive stores
its fee when it is written, and the wallet and the books are one database.

## Decision

- Every topup of a payment and every receive becomes one
  `accountTransaction` of kind `cashu`, with an `accountTransactionCashu`
  row naming the operation and the automatic claim of the payment that
  holds its quote or receive id, matched by id only.
- It is written in the batch that completes the operation: the proofs
  `available`, the operation `done`, the transaction and the claim
  together. What the booking needs — the payment holding the quote, the
  bill's close time — is read before that batch.
- The amount is the topup's amount, or the token's face value less the fee
  stored on its receive; no mint is asked.
- The transaction's id derives from the operation's
  (`accountTransaction:cashu:<operationId>`); a transaction another device
  wrote already is not written again.
- `bookedAt`, `unbookedCashuOperationsQuery` and the job's catch-up are gone:
  every device that completes an operation books it, and the booking syncs
  with the money.
- A melt settles together with its owner's rows: a withdrawal's movement
  once the melt is `paid`, its failure once the mint refused it, and a
  move's topup closed `failed` once the source did not pay. The Cashu job
  resuming a melt writes the same rows; a withdrawal's movement another
  device wrote already, synced in, is not written again, so its time and a
  note the merchant gave it stay.
- Not booked: a move's topup and every melt. A withdrawal books its own
  movement (withdraw/0015).
- Without a Cashu account nothing is booked.

## Alternatives considered

- The `evolu_history` cursor of `cashu/0005`: it depended on Evolu's
  internal table and read every change of a wallet Payky no longer shares.
- Booking in a batch after the completing one, marked by a `bookedAt` and
  caught up by the job: a crash between the batches leaves money unbooked
  until the catch-up runs, and a withdrawal's movement written after its
  melt's batch is missed for good, since the job resumes only pending melts.

## Consequences

An operation completed while the account had never enabled Cashu is not
booked later; no such operation arises, since nothing receives or claims for
an account without Cashu.

## Enforced by

- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a payment's topup is booked in the batch that completes it and claims the payment that holds its quote`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a received token is booked at its face value less the fee in the batch that completes it, and claims the payment holding its receive`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a token's fee comes off its face value`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a booking another device wrote is not written again, its id derived from the operation's`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a move's topup is not income`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > without a Cashu account nothing is booked`
- `packages/core/src/modules/cashu/cashu-booking-actions.test.ts > booking at completion (cashu/0014) > a topup claimed on one device syncs to another with its booking, which books nothing again`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > writes the movement or the failure in the batch that settles the melt`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a lost response stays in progress until the resume settles it; it is never sent again`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a melt the source does not pay closes the move's topup in the same batch`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a paid Cashu payment: claims the quote, books the topup, claims the payment`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a movement already booked stays as it is when the melt is settled paid again, as by another device's resume`
