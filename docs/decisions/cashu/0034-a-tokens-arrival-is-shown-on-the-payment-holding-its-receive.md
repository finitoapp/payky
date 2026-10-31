# 0034 A token's arrival is shown on the payment holding its receive

Status: accepted
Date: 2026-10-29

## Context

The wait screen says what became of a token sent for a payment
(`cashu/0020`). The listener wrote that note to the payment that
`matchCashuToken` found, the open one the NUT-18 payload names
(`cashu/0028`). A Cashu payment expires with its quote, after about ten
minutes.

Since `cashu/0029` and `cashu/0030` a token's outcome can take longer than
that. The spent token is checked for a grace, another device's attempt
is waited for and then taken over, and a contest stands for a grace. By
the time the outcome is known the payment has expired. The matcher no
longer finds it, so the note was never written. The screen kept saying
the token was being checked or received on another device, even when it
had ended spent elsewhere or contested and the merchant had to settle
the payment by hand.

What ties a token to its payment already survives expiry. The payment
holds the receive's id from the first pass (`paymentCashu.receiveOperationId`),
and a booking that payment holds is claimed for it whenever it lands
(`cashu/0025`).

## Decision

- The note goes to the open payment the payload names, as before, or,
  when that payment is no longer open, to it if it holds this token's
  receive.
- Nothing else changes. A payment is still given a token only while it
  is open (`cashu/0028`), and its claim still follows the hold.
- A token that first arrives after its payment expired is held by no
  payment, so it shows nothing on it.
- A token already booked is shown, and its booking claimed, only on a
  payment that holds its receive. The open payment the payload names takes
  a hold of it only when no payment holds it yet, as when the device that
  booked it had not seen the payment (`cashu/0025`). The arrival reads
  received only on the payment its booking is claimed for. A token booked
  for one payment and sent again with another's id therefore leaves the
  second payment's QR in place, rather than saying received while the
  payment stays unpaid. A payment that hid its QR for that token, or
  whose own pass received it while the booking was claimed for another
  payment, is told the wallet already holds the token, and its QR comes
  back.

## Alternatives considered

- Keeping the payment open while its token is being worked on: it would
  move expiry, which the payment's other methods share.
- Matching expired payments too: a token that arrives late would be
  given to a payment the customer was no longer looking at.

## Consequences

An expired payment's wait screen can show how its token ended, next to
the expired quote and its offer of a new one.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > an outcome reached after the payment expired is still shown on it`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a token that first arrives after the payment expired shows nothing on it`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a contest reached only by taking another device's attempt over is settled past its grace (cashu/0029)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a token another device booked after the payment expired is shown received on it, and claimed`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a booking no device claimed is claimed by the pass that shows it on the expired payment holding its receive`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a booked token sent again for another open payment is neither held by it nor shown received on it`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a payment whose hidden QR waited on a token booked for another payment gets its QR back`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token's arrival is shown on the payment holding its receive (cashu/0034) > a token received for a payment whose booking another payment claims is not shown received on it`
