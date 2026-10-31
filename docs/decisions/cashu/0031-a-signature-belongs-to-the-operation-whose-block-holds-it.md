# 0031 The counter starts past every attempt on record; a signature belongs to the operation whose block holds it, and a keyset scan stores only orphans, once synced

Status: accepted
Date: 2026-10-29

## Context

Each device keeps its NUT-13 counter locally (`cashu/0029`). The attempts
every device reserves are on record in `cashuOperationAttempt`. A device
whose counter fell behind another's derived that device's slots again:
each operation collided block by block, and it could take slots the other
device had reserved for a call still in flight. The counter has to move
past the attempts on record, and a NUT-09 restore of a keyset on a
device's first use of it covers slots signed before any attempt synced
in.

A first version of that restore did two unrelated things in one step. It
found where the counter can start without colliding with slots already signed, which
writes nothing but the counter. It also stored as `available`, with no
booking, every output the mint had signed in the keyset that the wallet
did not hold. That second step is a claim on signatures, and it took no
notice of whose they are.

A device's first use of a keyset comes with a new device, or after the
mint rotated its keyset. Another device's receive or topup may then have
its outputs signed and its answer lost. The first use stored those outputs
as anyone's. The operation's own reclaim (`cashu/0029`) then found them
stored, concluded another wallet or device had them, and never settled
or booked: the sats were in the wallet, and the payment stayed unpaid.

Two mechanisms claimed the same signatures, and no rule said which one
owned them. `cashu/0029` already says which: an output in a block an open
operation holds is that operation's, until the mint's word ends the
claim. A device that has not synced yet cannot apply that rule. An
attempt that has not arrived looks like no attempt at all.

## Decision

- Each time a device takes a keyset's counter lock, its counter moves past
  every block on record at that keyset, any device's: past
  `max(counter + slots)` over the attempts there. Every advance, a
  collision's recovery included, moves past the blocks on record too.
- A block records its size (`slots`): exactly the outputs its call asks the
  mint to sign (`cashu/0039`).
- A device's first use of a keyset scans it (NUT-09) first and starts its
  counter past the last signed slot. The scan stores nothing. That covers
  slots signed before any attempt synced in, and another wallet on the
  same seed.
- An output the mint signed in a block that an open operation holds with
  an attempt the mint did not refuse belongs to that operation. Only its
  reclaim stores it, and books it (`cashu/0014`, `cashu/0029`).
- The keyset's orphans, outputs outside every such block, are stored by
  their identity alone (`cashu/0024`), unbooked, when unspent and not yet
  held. Each device does this once per keyset, under the counter lock and
  only once it has synced (`AppOwnerSyncDep` answers `complete`; a sync
  blocked by a relay it cannot reach is not, `cashu/0013`). A device that takes the
  lock before then places its counter and leaves the orphans to a later
  use of the lock.

## Alternatives considered

- Keep storing everything and let a reclaim book stored outputs nobody
  booked: a stored output could as well be a closed operation's. That
  would conclude ownership from a missing booking, the kind of conclusion
  `cashu/0029` and `cashu/0030` removed.
- Drop orphan recovery: outputs whose operation's rows were lost, or that
  another wallet on the seed signed, would never come back.
- Disjoint ranges of the counter per device: no two devices could share a
  slot, but a NUT-09 restore from the recovery phrase in another wallet
  walks the slots from 0 with a gap limit and would miss every range but
  the first.
- Moving past the blocks on record only on the first use of a keyset: a
  device that falls behind later collides again.

## Consequences

Two devices share slots only when they reserve them before either has seen
the other's attempt. The mint's collision answers catch that, and
`cashu/0029` decides the shared block. Orphan recovery restores each open
operation's block once more to tell its outputs from the orphans. A device
that never completes a sync never recovers orphans. A closed operation's
outputs it never stored come back as orphans, unbooked.

## Enforced by

- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > cashu counters > the counter starts past every block on record, whichever device reserved it (cashu/0031)`
- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > cashu counters > a collision with slots another device used jumps past the last signed one`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a signature belongs to the operation whose block holds it (cashu/0031) > a device's first use of the keyset leaves another device's lost swap to its receive, which books it`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a signature belongs to the operation whose block holds it (cashu/0031) > orphans are not recovered before this device has synced, and are once it has`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a new device restores the keyset before its first claim and starts past what is signed`
