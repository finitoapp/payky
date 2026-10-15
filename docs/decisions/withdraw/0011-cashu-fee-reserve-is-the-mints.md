# 0011 A Cashu withdrawal's fee reserve is the mint's

Status: accepted
Date: 2026-10-14

## Context

A Spark withdrawal reserves a fee Payky derives from the SDK's estimate
(withdraw/0004). A Cashu withdrawal is a melt: the mint quotes the invoice
with its own `fee_reserve` and returns what the payment did not use as
change (`cashu.md` §6).

## Decision

- The review shows what goes out and the most that can leave the mint: the
  amount, the mint's `fee_reserve`, and the NUT-02 input fees of the melt
  inputs and of the swap that cuts them out of the balance.
- The melt is refused before anything moves when that total exceeds what
  was confirmed or what the mint's confirmed unspent proofs hold.
- The withdrawal's movement is what actually left: the inputs less the
  change.
- One mint at a time; the default mint is preselected. Destinations are a
  Lightning invoice with an amount or a Lightning address with one.

## Alternatives considered

Payky's own reserve on top of the mint's: the mint already returns what it
did not use.

## Consequences

"Withdraw all" from a mint is not offered yet.

## Enforced by

- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > melts at the mint and books the money that left, once`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > an invoice without an amount is refused`
- `src/core/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a melt refused before it was sent fails the withdrawal and returns why`
- `src/core/cashu/cashu-melt.test.ts > meltCashu > refuses a melt the balance cannot cover before anything moves`
- `src/core/cashu/cashu-melt.test.ts > meltCashu > pays the invoice, keeps the change and closes the melt paid`
