# 0016 Payky receives tokens from any mint the merchant trusts

Status: accepted
Date: 2026-10-28

## Context

`cashu/0011` let Payky receive a token only from the payment mint. It
rejected a list of trusted mints only because Linky would not read it; with a
wallet of Payky's own (`cashu/0012`) that reason is gone. A customer whose
ecash sits at another mint the merchant would accept could not pay with a
token, and adding a mint on the mints screen said nothing about trust
(`docs/plans/cashu-trusted-mints.md`).

## Decision

- The trusted mints are one list, the default first (`cashu/0013`), so the
  default is always trusted. A device that knows no list and no seed trusts
  no mint, `MAIN_MINT_URL` included: it has not synced the account's mints,
  takes no Cashu payment and receives no token until they sync in, and its
  Cashu screens list no trusted mint (`cashu/0018`, `cashu/0020`).
- Payky receives a token when its mint is trusted at the moment the token is
  processed. A token from any other mint it does not receive, match or hold
  a receive id for, and the wait screen says so (`untrustedMint`). A mint
  untrusted while a payment waits no longer pays it.
- A token received at a trusted mint that is not the default leaves its
  money at that mint. Nothing moves it to the default; the merchant moves
  funds by hand.
- The NUT-18 request names the trusted mints in the list's order, the
  default first, capped at
  `NUT18_MAX_MINTS` (3) so the QR stays readable; with no trusted mint it
  names none and the QR carries no request. The Lightning leg stays at
  the payment's own mint. Payky receives from every trusted mint, not only
  the ones the QR names.
- Matching: a NUT-18 payload goes to the open payment it names, whatever
  its mint; a bare token pays no payment and is received unassigned
  (`cashu/0028`).

## Alternatives considered

- Receiving from the default only, as `cashu/0011` did: a customer with
  ecash elsewhere could not pay even at a mint the merchant would trust.
- Moving every token received elsewhere to the default automatically: a melt
  and a Lightning fee on every such payment, and another way to fail.

## Consequences

- The merchant's balance can spread over several mints, each a counterparty
  of its own; the mints screen shows it per mint.
- A QR with three long mint URLs is denser; the cap is lowered if it stops
  scanning on a small phone.
- A device with no trusted row takes no Cashu payment and receives no token,
  `MAIN_MINT_URL` included (`cashu/0018`, `cashu/0020`); a token from a mint
  not trusted is received once the mint is trusted, and its note stays
  beside the QR (`cashu/0020`).

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a trusted mint that is not the default is received and pays, its money staying there (cashu/0016)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint untrusted after the payment was created is refused`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint not trusted is not received and pays nothing (cashu/0016)`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0016) > the request names at most the cap, the default first`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0016) > with no trusted mint the request names none, MAIN_MINT_URL included (cashu/0018)`
- `packages/core/src/cashu/cashu-payment-request.test.ts > the Cashu tab's payment request > names the trusted mints it is given, in their order (cashu/0016)`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > a mint named only by proofs or operations is not trusted`
