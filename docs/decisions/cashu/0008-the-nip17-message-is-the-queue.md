# 0008 No deferred receive: the NIP-17 message is the queue

Status: accepted
Date: 2026-10-14

## Context

A token can arrive while its mint is down. Linky then writes a
`deferredReceive`; a second writer of those would race Linky's own retries
(`cashu.md` §5 "Mint unreachable", decision 12).

## Decision

- When the mint cannot be loaded or does not answer before the swap, Payky
  writes nothing and leaves the token in its NIP-17 message.
- The listener runs whenever the Cashu account is enabled and, on every
  tick, tries each token message in its look-back window (7 days, never less
  than NIP-59's two) whose receive is not `done` or `failed`. A final refusal
  that writes nothing is remembered for the run.
- Payky never resumes or closes Linky's `deferredReceive` rows.

## Alternatives considered

Writing `deferredReceive` like Linky: two apps resuming one row.

## Consequences

A mint down for longer than the window, or a relay that drops the message,
leaves the token to Linky's own deferral or to the merchant.

## Enforced by

- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > an unreachable mint writes nothing`
- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > a spent token writes nothing`
- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > someone else got there first > Linky received it: done, nothing written`
- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > someone else got there first > a receive Linky has pending: nothing is written, never failed`
