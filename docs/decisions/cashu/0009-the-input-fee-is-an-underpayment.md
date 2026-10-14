# 0009 A token's input fee is settled as an underpayment

Status: accepted
Date: 2026-10-14

## Context

A mint may charge a NUT-02 input fee to swap a token. Linky credits what
reached the wallet (`cashu.md` §5, decision 5d).

## Decision

- A received token is recorded at its face value less the mint's input fee,
  and a payment it pays is credited that. A short receipt shows as underpaid
  under the existing coverage rules, and the merchant settles it like any
  other underpayment.
- A token the fee would consume whole is refused before anything is written.
- The claim matches by quote or operation id only, never by amount, so a
  token after its fee still settles its payment.

## Alternatives considered

Asking the customer for the fee on top: the NUT-18 request names the amount
the merchant wants, and wallets do not add mint fees to it.

## Consequences

Most mints charge no input fee, so this is usually zero.

## Enforced by

- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > credits what is left after the mint's input fee`
- `src/core/cashu/cashu-receive.test.ts > receiveCashuToken > refuses a token the fee would eat whole, writing nothing`
