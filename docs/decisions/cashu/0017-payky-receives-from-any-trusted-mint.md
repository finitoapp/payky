# 0017 Payky receives tokens from any mint the merchant trusts

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

- A `cashuMint` row of Payky's Cashu wallet is a mint the merchant trusts; a
  tombstone is a mint no longer trusted. The default mint (`cashu/0013`) is
  always trusted, so with no row at all `MAIN_MINT_URL` is the one trusted
  mint.
- Payky receives a token when its mint is trusted at the moment the token is
  processed. A token from any other mint it does not receive, match or hold
  a receive id for, and the wait screen says so (`untrustedMint`). A mint
  untrusted while a payment waits no longer pays it.
- A token received at a trusted mint that is not the default leaves its
  money at that mint. Nothing moves it to the default; the merchant moves
  funds by hand.
- The NUT-18 request names the trusted mints, the default first, then by
  their last choice as default and the never-chosen ones by URL, capped at
  `NUT18_MAX_MINTS` (3) so the QR stays readable. The Lightning leg stays at
  the payment's own mint. Payky receives from every trusted mint, not only
  the ones the QR names.
- Matching is unchanged: a NUT-18 payload goes to the open payment it names,
  a bare token to the one open payment of its face amount (`cashu/0006`,
  `cashu/0011`).

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

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a trusted mint that is not the default is received and pays, its money staying there (cashu/0017)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint untrusted after the payment was created is refused`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint not trusted is not received and pays nothing (cashu/0017)`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0017) > the default first, then by the last choice, then the never-chosen by URL`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0017) > the request names at most the cap, the default first`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0017) > with no trusted row the default MAIN_MINT_URL is the one trusted mint`
- `packages/core/src/cashu/cashu-payment-request.test.ts > the Cashu tab's payment request > names the trusted mints it is given, in their order (cashu/0017)`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > a mint named only by proofs or operations is not trusted`
