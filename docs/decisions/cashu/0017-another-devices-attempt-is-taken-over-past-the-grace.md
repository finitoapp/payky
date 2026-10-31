# 0017 Another device's attempt is left to it for a grace, then taken over

Status: accepted
Date: 2026-10-28

## Context

A topup claim or a token receive whose attempts are all another Payky
device's is that device's to finish (`cashu/0029`). Waiting for it forever
fails when that device crashed, was wiped or reinstalled: a quote stays
`PAID` or `ISSUED`, a token stays unswapped or its outputs unstored, and the
payment's sats are never minted or booked.

Taking it over at once fails the other way. While that device still works,
it may have stored the proofs, not yet synced here, and already held them
for a melt or spent them; a reclaim here would store them `available`
again, and the later write would show them available on every device.

A grace that every unanswered pass starts again never runs out. With
passes every 30 seconds, a grace of 5 minutes deleted on any pass that did
not repeat its outcome needed about ten clean passes in a row; under a mint
failing more often than that, the takeover, a contest given to no one
(`cashu/0029`), or a spent token's sleep (`cashu/0030`) never came.

## Decision

- Another device's attempt is left to it for a grace,
  `CLAIMED_ELSEWHERE_GRACE_MS` (5 minutes), counted from when this device
  first saw that device's latest attempt: by the Cashu job for a topup, by
  the token listener for a receive. A newer attempt of that device's starts
  the grace again. Meanwhile a receive's arrival is `receivingElsewhere` and
  the message is tried again.
- Past the grace, while the attempt seen is still that device's latest,
  Payky takes it over. A topup: an `ISSUED` quote is reclaimed through NUT-09
  from the attempts on record, a `PAID` one minted at that attempt's slots,
  adopted as this device's own. A receive: a spent token is reclaimed from
  that device's attempts, an unspent one swapped in its place.
- A grace counts on through passes the mint did not answer. The token
  listener keeps a message's graces, another device's attempt, a contested
  block and a token spent elsewhere, in one record that one pure function,
  `advanceCashuTokenGraces`, moves from each pass's outcome. A pass that
  ended `retryLater`, because the mint did not answer or another call was
  spending the token right then, leaves every grace where it was. Any
  other outcome ends the graces it contradicts: a contest keeps the
  takeover it was reached through, a token spent elsewhere ends the other
  two, a settled message ends all three. The Cashu job keeps its graces for
  topups and melts through failed calls the same way.
- The seed is the account's, so the outputs at that device's slots are the
  ones it derived: the mint issues a quote once, to whichever device asks
  first, and NUT-09 recovers the proofs on either device. The booking's id
  derives from the operation, so both devices completing it write one
  transaction (`cashu/0014`).
- That device's latest attempt is the last it reserved, by Evolu's
  timestamp of the write, whatever its keyset: after the mint rotated, a
  new keyset's first slots come after an old keyset's highest one. Within
  one keyset a device's counter never moves back, so there its highest slot
  is its latest.

## Alternatives considered

- Waiting for the other device indefinitely: a device that never returns
  leaves the payment unpaid for good.
- Taking over at once: the race above while the device is alive, for a few
  minutes saved after a device fails.
- Deleting a grace on every pass that does not repeat its outcome: a flaky
  mint keeps it from ever running out.
- Timing the grace from the attempt's `createdAt`: it would survive a
  restart, but it is the other device's clock, and skew would shorten or
  stretch the grace.

## Consequences

The grace lives in memory: a restart of the app starts it again. A device
that comes back after the takeover finds the operation settled, the quote
`ISSUED` or the token spent, and its proofs already in the wallet the taker
settled.

A topup claim that has an attempt of this device's reclaims every attempt on
record at once, the other device's included; that needs both devices to
have claimed the same quote together.

## Enforced by

- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a claim made elsewhere is taken over past its grace > a quote the other device never minted is minted at its attempt`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a claim made elsewhere is taken over past its grace > a quote the other device did mint is reclaimed at its attempt, never minted twice`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a claim made elsewhere is taken over past its grace > the takeover is this device's attempt: a lost response is reclaimed at once`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a claim made elsewhere is taken over past its grace > an attempt that is no longer the other device's latest is waited for again`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device's attempt is taken over past the grace > within the grace a spent token is left to that device`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device's attempt is taken over past the grace > a swap that device made and never finished is reclaimed from its attempt`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device's attempt is taken over past the grace > a token that device never swapped is swapped in its place`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device's attempt is taken over past the grace > an attempt that is no longer that device's latest is waited for again`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > another Payky device's attempt is left to it within the grace (cashu/0017)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token another Payky device has pending is tried again, and received from its attempt once taken over past the grace (cashu/0029, 0017)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > a pass the mint did not answer leaves every grace where it was`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > another device's attempt keeps its grace, and a newer one starts it again`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > a contest keeps the takeover it was reached through`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > a token spent elsewhere ends the other graces, and a settled message every one`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > another device's attempt is taken over past the grace though a pass between found the mint unreachable`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a grace counts on through passes the mint did not answer (cashu/0017) > a contest is given to no one past its grace though a pass between found the mint unreachable`
- `packages/core/src/modules/cashu/cashu-guards.test.ts > the latest attempt of a device > another device's latest is its last reserved, not its highest slot of any keyset`
- `packages/core/src/modules/cashu/cashu-guards.test.ts > the latest attempt of a device > this device's latest across keysets is its last reserved; in one keyset its highest slot`
