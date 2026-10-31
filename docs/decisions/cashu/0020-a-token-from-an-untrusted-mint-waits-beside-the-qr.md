# 0020 A token from an untrusted mint waits for its mint, said beside the QR

Status: accepted
Date: 2026-10-28

## Context

`cashu/0016` leaves a token from a mint the merchant does not trust
unreceived and has the wait screen say so (`untrustedMint`). The listener
then remembered the message as done for the run, and the wait screen let
that note replace the QR, as it does for every arrival. A bare token of the
payment's face amount from any mint, sent by anyone, therefore hid the
payment's Lightning and NUT-18 QR for good, the note being a stored row; and
trusting the mint did not receive the token until the app restarted
(finding 8 of the PR #172 review). The listener also took an empty trust
list for `MAIN_MINT_URL`, so a device whose `cashuMint` rows had not synced
in, or were all tombstoned, received from `MAIN_MINT_URL` even when the
merchant had untrusted it, which `cashu/0018` rules out for preparation.

The `failed` and `receivedElsewhere` arrivals leave the payment unpaid as
well and hid the QR the same way, while `receivedElsewhere` also stood for a
token another Payky device of the account is still receiving, which will pay
the payment (`cashu/0029`).

## Decision

- A token from a mint not trusted is not final for the run. The listener
  keeps its message and, on every tick, checks the mint against the trust
  list this device holds, asking no mint and writing nothing; once the mint
  is trusted it receives the token as any other (`cashu/0016`). Stopping the
  listener forgets this, as it forgets every loaded message (`cashu/0030`).
- The trust list is the list of trusted mints this device knows
  (`cashu/0013`). With none, no mint is trusted, `MAIN_MINT_URL` included
  (`cashu/0018`).
- On the wait screen an arrival that leaves the payment unpaid is said
  beside the QR, never in its place, so the customer can still pay another
  way: `untrustedMint`, `receivedElsewhere` (spent by Linky on the same npub
  or by a customer's double spend, for good) and `failed` (refused for good).
  An `untrustedMint` token is received should the merchant trust its mint
  later; that takes the merchant's own act, and a stray token must not block
  the payment.
- An arrival that has paid the payment, or may still pay it without anyone
  acting, replaces the QR, so the customer is not invited to pay twice:
  `receiving`, `waitingForMint` (tried again), `received`, and
  `receivingElsewhere`.
- A token spent while another Payky device of the account has its receive
  pending (`cashu/0029`, `cashu/0030`) is `receivingElsewhere`, not
  `receivedElsewhere`: that device will settle the payment. Once no device's
  receive is pending, the arrival is whatever this device's next try finds.

## Alternatives considered

- Retrying an untrusted-mint message on the 30 s pause of an unreachable
  mint: trusting the mint would wait for the pause for no reason, and each
  try would rewrite the arrival.
- Hiding the note once trusted mints change: the note is true until the
  token is received, and then it is replaced by what the receive wrote.
- Keeping the QR beside every arrival short of `received`: a token the mint
  has not answered for yet, or another device is receiving, still pays the
  payment, and a customer paying the QR meanwhile pays twice.
- Telling `receivingElsewhere` apart only in the listener, keeping one
  `receivedElsewhere` arrival: the screen could not know whether the token
  may still pay the payment.

## Consequences

- A stray token for the payment's amount from an untrusted mint, a token
  spent elsewhere or one refused no longer blocks the payment; the merchant
  sees the note and may trust the mint, settle by hand, or let the customer
  pay the QR.
- A mint that stays down, or another device whose pending receive never
  completes, keeps the QR hidden while the token is tried again; the
  merchant can still settle the payment by hand.
- Each tick reads the trusted mints once while such a message waits, a
  local query.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint not trusted yet is received on the next pass once the mint is trusted, no restart (cashu/0020)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token from a mint still not trusted is re-checked against the trust list only: the next pass asks no mint (cashu/0020)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a device that knows no trusted mint receives no token, not even from MAIN_MINT_URL (cashu/0018, cashu/0020)`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the wait screen's arrival note (cashu/0020) > an arrival that leaves the payment unpaid keeps the QR: an untrusted mint, spent elsewhere for good, refused for good`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the wait screen's arrival note (cashu/0020) > an arrival that pays the payment, or may still pay it, replaces the QR: receiving, waiting for the mint, received, receiving or checked for on another device`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token another Payky device has pending is tried again, and received from its attempt once taken over past the grace (cashu/0029, 0017)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0029)`
