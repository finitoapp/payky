# 0008 Reversals live in their own table

Status: accepted
Date: 2026-09-29

## Context

Every reader of the sale table in a version without refunds takes each row
there as a positive sale to deliver. Devices of one account can run
different versions while they update.

## Decision

Reversals are stored in `eetReversal` and `eetReversalConfirmation`, beside
the sale tables, with the amount stored positive and sent negated.

## Alternatives considered

A reversal row in the sale table, stored positive like every reversal
amount. An older device of the same account would deliver it as a positive
sale.

## Consequences

Sale and reversal code share the delivery rules but read different tables.

## Enforced by

Untestable: the risk lives in older builds running on other devices of the account, which the tests of the current code cannot run.
