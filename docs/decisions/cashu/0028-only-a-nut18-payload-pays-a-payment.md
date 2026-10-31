# 0028 Only a NUT-18 payload pays a payment; a bare token is received unassigned

Status: accepted
Date: 2026-10-29

## Context

A bare token names no payment. `cashu/0006` gave it to the one open payment
of its face amount, because Linky as a payer sent only bare tokens. Linky
now pays a NUT-18 request with a payload that names the payment.

Matching by amount reads only the payments this device has. Two tills,
each with an open payment of the same price not yet synced to the other,
each give one bare token to their own payment. Both hold the receive and
complete it from the same attempt (`cashu/0029`). Each writes a claim of
its own payment on the one transaction, and the claims' ids differ, so both
survive the merge: two payments read paid for money that arrived once. The
same reading by amount left two open payments of one price ambiguous
(`cashu/0006`) and could give an old token to a new payment (`cashu/0025`).

## Decision

- A token pays a payment only when its NUT-18 payload names that payment
  and the payment is open. The listener reads no candidate payments for a
  bare token.
- A bare token is still received from a trusted mint (`cashu/0016`) and
  booked unassigned, like a payload naming no open payment: the money is in
  the wallet, and the merchant claims it by hand. No payment holds its
  receive and the wait screen shows nothing for it.
- Payky still reads bare tokens from its inbox (`cashu/0006`).

## Alternatives considered

- One claim per transaction, so the later of two devices' claims wins: one
  of the two payments would still read paid until the merge, and the
  ambiguity and the old token paying a new payment would remain.
- Ignoring bare tokens: a customer's money would reach the wallet only
  through Linky on the same npub, or not at all.

## Consequences

A customer whose wallet sends a bare token pays no payment on its own: the
till shows the payment unpaid until staff claim the transaction. A payment
open on two tills is paid once, whichever till receives the token, since
both write the claim of the payment the payload names.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > matchCashuToken > a bare token is unassigned, though one payment is open (cashu/0028)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a bare token is received and booked unassigned, though an open payment has its face amount (cashu/0028)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > matchCashuToken > a payload goes to the open payment its id names`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token for the payment is received, booked and pays it; the wait screen sees it`
