# 0008 Reversals live in their own table

Status: accepted
Date: 2026-09-29

## Context

A version without refunds lists every row of the sale table as a positive
sale, and delivers the rows that carry its own device id. Devices of one
account can run different versions while they update.

## Decision

Reversals are stored in `eetReversal` and `eetReversalConfirmation`, beside
the sale tables, with the amount stored positive and sent negated.

## Alternatives considered

A reversal row in the sale table, stored positive like every reversal
amount. Every older device would list it as a positive sale, and the device
that recorded the refund would deliver it as one after going back to an
older version.

## Consequences

Sale and reversal code share the delivery rules but read different tables.

## Enforced by

- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > reverses $name`
- `src/core/modules/eet/eet-actions.test.ts > createEetReversal > keeps a reversal out of the sale table`
- `src/core/modules/eet/eet-actions.test.ts > deliverEetReversal > sends the negative amount at the moment of the refund`
