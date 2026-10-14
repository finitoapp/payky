# 0005 Every incoming Cashu operation is booked, matched only by id

Status: accepted
Date: 2026-10-14

## Context

The wallet is shared with Linky, so money arrives through Payky's payments
and through the owner's personal use alike (`cashu.md` §5, decision 13). An
operation from a device offline for a week arrives under a week-old time.

## Decision

- Every `done` `receive` and `topup` in the wallet, whoever performed it,
  becomes one `accountTransaction` of kind `cashu`, its id derived from the
  operation id, with an `accountTransactionCashu` row naming the operation.
  Outgoing operations are booked only for Payky's own withdrawals.
- The booking reads changes through a cursor over `evolu_history` rowids, the
  order changes arrived on this device, kept in the local-only
  `_cashuBookingCursor`. Without a cursor it books the last month and stores
  the rowid it read before the scan. It never rewrites a booked operation.
- In the same batch it writes the automatic claim of the payment whose
  `paymentCashu` holds the operation's quote, or its receive at the same
  mint. Never by amount: a token after its input fee would not match.
- The amount is what reached the wallet: a topup's amount, a token's face
  value less the mint's input fee.

## Alternatives considered

- A time cursor: misses an operation that arrives late with an old time.
- Rescanning every operation each run: grows with the wallet's age.

## Consequences

- The owner's personal incoming payments appear in the Cashu account's
  transactions to everyone with access to it; unclaimed ones reach no
  revenue, EET or statistics.
- The books do not match the wallet's balance: Linky's spending is missing.
- A new Payky device books only the last month of an existing wallet.

## Enforced by

- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > books a settled topup once and claims the payment that holds its quote`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > never rewrites what it booked`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > books a topup Linky settled, and claims the payment`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > an operation that arrives late with an old time is still booked, and stays unclaimed when no payment holds it`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > a new device books only the last month of an existing wallet`
- `src/core/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a paid Cashu payment: claims the quote, books the topup, claims the payment`
