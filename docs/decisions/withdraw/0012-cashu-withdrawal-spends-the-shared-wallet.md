# 0012 A Cashu withdrawal may spend money received in Linky

Status: superseded by withdraw/0015
Date: 2026-10-14

## Context

The Cashu balance is the wallet Payky shares with Linky (cashu/0001), the
sum of its `available` proofs per mint, whoever received them (`cashu.md`
§6).

## Decision

A withdrawal spends the mint's balance as Linky shows it, including ecash the
owner received personally in Linky. It is one wallet.

## Alternatives considered

Limiting withdrawals to what Payky booked: the books do not match the wallet
(cashu/0005), and the proofs carry no owner.

## Consequences

Whoever may withdraw in Payky can spend the owner's personal ecash; the PIN
guards it (access/0007).

## Enforced by

Untestable: it is the absence of a filter. The balance a withdrawal draws
from is `sumAvailableByMint` over every proof of the shared wallet, which
`packages/core/src/cashu/cashu-melt.test.ts > meltCashu > pays the invoice, keeps the change and closes the melt paid`
exercises without telling Payky's proofs from Linky's.
