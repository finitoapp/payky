# 0015 A Cashu withdrawal spends Payky's own wallet

Status: accepted
Date: 2026-10-26

## Context

`withdraw/0012` let a withdrawal spend money received in Linky, because the
wallet was shared with Linky. Payky now keeps its own wallet (cashu/0012).

## Decision

A withdrawal spends the chosen mint's balance in Payky's Cashu wallet:
the `available` proofs there, received by any Payky device of the account.
Ecash received in Linky is not in it.

## Alternatives considered

None recorded.

## Consequences

Whoever may withdraw in Payky can spend what Payky received, nothing of the
owner's personal Linky wallet; the PIN guards it (access/0007).

## Enforced by

- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > melts at the mint and books the money that left, once`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > pays the invoice, keeps the change and closes the melt paid`
