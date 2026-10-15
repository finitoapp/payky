# 0011 Payky receives tokens only from the default mint; a received token pays whatever its mint

Status: accepted
Date: 2026-10-15

## Context

`cashu/0007` let Payky receive a token from any mint and decided trust at
the match: a token paid a payment only from the payment's own mint. The
owner wants trust decided once, by whichever app receives the token, and
not checked again afterwards. Linky receives from any mint; it is the
owner's own app, and the shared data is trusted (`cashu/0001`). Linky keeps
no synced list of trusted mints; the one mint both apps share is the synced
`defaultMint` setting.

## Decision

- Payky receives a token only when its mint is the current default mint.
  A token from any other mint it does not receive, match or hold a receive
  id for; the wait screen of a payment it was sent for says so. This is the
  one receive rule Payky does not copy from Linky, and the only check it
  adds.
- Linky receives from any mint, and its receive counts as trusted.
- Nothing checks a token's mint after the receive. A NUT-18 payload goes to
  the open payment it names; a bare token to the one open payment of its
  face amount. The automatic claim matches a token by its receive id at any
  mint. A topup still matches by quote id at the payment's mint, because a
  quote id is unique only within its mint.

## Alternatives considered

- A list of trusted mints (the default plus mints added by hand), shared
  with Linky as a new synced setting: Linky does not read such a list, so
  it would be Payky's alone until Linky adopts it.
- Keeping `cashu/0007`'s match rule: trust would be decided twice, and a
  token Linky received from another mint would never pay.

## Consequences

- A token sent for a waiting payment from a former default mint (the
  default changed meanwhile, in either app) is not received by Payky.
- A rogue mint's token that Linky received pays the payment holding its
  receive id. The owner's defence there is Linky's receive.

## Enforced by

- `src/core/cashu/cashu-token-listener-trust.test.ts > a token from a mint other than the default is not received and pays nothing (cashu/0011)`
- `src/core/cashu/cashu-token-listener.test.ts > matchCashuToken > a payload goes to the open payment its id names, whatever its amount`
- `src/core/cashu/cashu-token-listener.test.ts > matchCashuToken > a bare token goes to the one open payment of its face amount`
- `src/core/cashu/cashu-booking.test.ts > bookCashuOperations > a token another app received from another mint claims the payment that holds its receive`
