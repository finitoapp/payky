# 0001 Every withdrawal is its own record, written before the money moves

Status: accepted
Date: 2026-10-09

## Context

A withdrawal from the Spark wallet used to exist only as an account
transaction, written after the money left. An app killed mid-send left
nothing to follow, nobody could tell which device sent what, and
Lightning withdrawals had no place at all.

## Decision

- Each withdrawal is a `withdrawal` row plus one detail row by kind,
  `withdrawalOnchain` or `withdrawalLightning`, like `payment`. The
  kind is whichever detail row exists; soft delete touches only the main
  row.
- The main row carries the account, the device that sent it, the amount
  the recipient gets, and `accountTransactionId`: the movement that will
  record it, known before sending (Lightning: `accountTransaction:spark:<transferId>`;
  on-chain: a fresh id the follow-up write uses).
- The rows are written in their own batch before any money moves; what
  happened afterwards is a second batch.
- Technical facts about the actual transfer (`txid`, `coopExitRequestId`,
  preimage, Spark transfer id) stay in the account transactions; the
  detail rows hold what the merchant chose.
- An on-chain withdrawal is at least 10 000 sats, the minimum Spark's
  "Withdraw to L1" documentation states; the quote refuses less before
  asking for a fee quote, and a "withdraw all" that would leave the
  recipient less.
- History starts with this release. Earlier on-chain withdrawals are not
  migrated and stay among the account transactions.

## Alternatives considered

Keeping withdrawals as account transactions only: no record survives a
crash between sending and recording, and a Lightning payment that has not
settled yet has nowhere to wait.

## Consequences

- On-chain movements now have two id schemes: the old derived
  `accountTransaction:onchain:<coopExitRequestId>` and the new random one.
  Deduplicating an on-chain movement by id no longer works, which is fine
  while the withdrawal action is its only writer.
- The history points to a read-only list of the Spark account's
  transactions for the withdrawals made before it.

## Enforced by

- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > records an on-chain withdrawal and its movement under the id it named up front`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > pays a Lightning invoice and leaves the movement to the sync job`
- `src/core/modules/withdraw/withdraw-actions.test.ts > executeWithdrawal > leaves a rejected on-chain withdrawal uncertain`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses an on-chain amount below the minimum before asking for a fee quote`
- `src/core/modules/withdraw/withdraw-actions.test.ts > quoteWithdrawal > refuses an on-chain withdraw-all that would leave the recipient less than the minimum`
- `src/core/modules/withdraw/withdraw-queries.test.ts > withdrawal queries > type comes from the detail row and a pending withdrawal has no outcome`
