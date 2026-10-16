# 0007 Tokens from any mint are received, but pay only from the payment's mint

Status: superseded by cashu/0011
Date: 2026-10-14

## Context

Anyone can run a mint, issue ecash on it and pay with tokens worth nothing.
Linky shares the nostr key and receives every token it sees, from any mint,
so refusing a token in Payky protects nothing (`cashu.md` §5, decision 5c).

## Decision

- Payky receives a token from any mint, as Linky does.
- A token pays a payment only when its mint is the payment's
  `paymentCashu.mintUrl`, the one mint the request names. The match and the
  automatic claim both hold this.
- Any other token is received unassigned. A payload naming the payment from
  another mint shows on the wait screen as arrived but not counted.
- Nothing assigns an unassigned token to a payment afterwards; the payment
  stays unpaid and is settled like any unpaid payment.

## Alternatives considered

Refusing foreign tokens: Linky would receive them anyway. Widening to mints
the merchant added, or swapping to the default mint first, may follow.

## Consequences

Unused mints collect in the shared wallet and in Linky's mint list.

## Enforced by

- `packages/core/src/cashu/cashu-token-listener.test.ts > matchCashuToken > a payload from another mint is shown on its payment but never counted`
- `packages/core/src/cashu/cashu-token-listener.test.ts > matchCashuToken > a payload for a payment no longer open is received unassigned`
- `packages/core/src/cashu/cashu-token-listener.test.ts > matchCashuToken > a payload naming no known payment is unassigned, not matched by amount`
- `packages/core/src/cashu/cashu-booking.test.ts > bookCashuOperations > a token from another mint never claims the payment that holds its receive`
