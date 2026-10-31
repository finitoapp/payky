# 0025 A booking made before its payment synced is claimed once both are here

Status: accepted
Date: 2026-10-29

## Context

A receive is booked in the batch that completes it, with the claim of the
payment that holds its receive id (`cashu/0014`). The device that receives
the token need not be the one that created the payment. Device A creates a
payment and the customer pays at once. Device B's listener takes the
NIP-17 message before the payment has synced to B: it finds no payment,
receives the token unassigned and books it without a claim.

Nothing claimed it afterwards. A's listener saw the receive `done` and
stopped before the payment held its receive id, and `loadCashuBooking` adds
a claim only to a transaction it writes itself, never to one another device
wrote. The money was in the wallet and booked, and the payment stayed
unpaid on every device, inviting the customer to pay again.

## Decision

- The listener works on a token whose receive another device already
  booked: when its NUT-18 payload names an open payment, that payment holds
  the receive id and claims the booking, and the wait screen shows the
  token received.
- A bare token is never given to a payment (`cashu/0028`), booked already
  or not: an amount would pick the one open payment that fits now, which may
  have been opened after the token was booked.
- Whenever a receive ends `done` under the listener, the payment holding it
  claims its booking if no claim does yet.
- The Cashu job claims, on every pass, each Cashu transaction that no claim
  holds while a payment with no claim of its own holds its quote or receive
  id, through `reconcileAccountTransaction`, as the Spark and FIO jobs do for
  their transactions. That covers the order in which the payment's hold and
  the booking reach a device.

## Alternatives considered

- Claiming inside `loadCashuBooking` when the transaction exists already:
  only the device that completes the operation runs it, and the payment may
  reach it later still.
- Matching a booked bare token by amount: an old token would pay a new
  payment of the same price.

## Consequences

A bare token stays unassigned; the merchant claims it by hand, as any
unassigned transaction.

The job's pass runs one query over the Cashu transactions every tick;
`reconcileAccountTransaction` is idempotent, so a claim written meanwhile by
another device is not written twice on this one.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token another Payky device booked before the payment reached it is held and claimed by the payment its payload names (cashu/0025)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a bare token another device booked is not given to a payment by its amount alone (cashu/0025)`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > claims for its payment a token booked on a device the payment had not reached (cashu/0025)`
