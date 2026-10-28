# 0008 No deferred receive: the NIP-17 message is the queue

Status: accepted
Date: 2026-10-14

## Context

A token can arrive while its mint is down. Linky then writes a
`deferredReceive`; Payky keeps no such row (`cashu.md` §5 "Mint
unreachable", decision 12), and its wallet is its own (cashu/0012).

## Decision

- When the mint cannot be loaded or does not answer before the swap, Payky
  writes nothing and leaves the token in its NIP-17 message.
- The listener runs whenever the Cashu account is enabled and, on every
  tick, tries each token message in its look-back window (7 days, never less
  than NIP-59's two) whose receive is not `done` or `failed`. A final refusal
  that writes nothing is remembered for the run.
- Payky writes no `deferredReceive` of its own.

## Alternatives considered

A deferred-receive row like Linky's: a second queue next to the message,
which already is one.

## Consequences

A mint down for longer than the window, or a relay that drops the message,
leaves the token to the merchant.

## Enforced by

- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > an unreachable mint writes nothing`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a token another wallet already spent is received elsewhere, writing nothing`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > another device received it: done, nothing written`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > a receive another device has pending: nothing is written, never failed`
