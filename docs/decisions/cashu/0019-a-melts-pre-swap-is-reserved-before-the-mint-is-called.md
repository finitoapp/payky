# 0019 A melt's pre-swap is reserved before the mint is called

Status: accepted
Date: 2026-10-28

## Context

A melt first swaps exactly what it needs out of its sources (`cashu.md`
§7). That swap spends the sources at the mint, and Payky used to write
nothing until its answer arrived. A crash or a lost answer after the mint
swapped left the sources `available` here while they were spent at the
mint, and the swap's outputs were never stored. The counter had already
moved past their slots, and a keyset is restored only on a device's first
use of it (cashu/0029), so nothing scanned them again: the balance showed
spent proofs and the swapped value was lost to the wallet (finding 6 of the
PR #172 review).

The pre-swap's outputs cannot wait on the melt's own held sources to say
whether the swap ran. Another device's NUT-07 check can mark the sources
spent first, or a melt there hold them under its own id (`cashu/0024`,
`cashu/0026`), so the melt may hold nothing spent while its swap did run.

A swap whose answer was lost may also not have run yet: the request can
still sit in a proxy or the mint's queue. Unspent sources say only that.
Closing the melt `failed` on them let the late swap spend the sources and
sign outputs at a block no one restores once the melt is closed, losing the
whole amount. A swap has no expiry after which the mint refuses it, so
waiting does not end the doubt.

Two devices can also start a melt at the same mint at the same time, each
selecting its sources under its own counter lock only (`cashu/0026`), so
both may hold the same proof; its `operationId` is last-write-wins
(`cashu/0024`). When the melt that lost the cell swaps first, the other's
pre-swap is refused for spent inputs and leaves no live block. Settling it
reads the proof spent with no block of its own to account for it, yet no
fence by another device exists to wait for: the melt that spent the proof
never marks it spent here. No wallet but Payky's own devices spends from
its seed (`cashu/0012`), so such a melt is the only call the spend can
belong to. A fence of a melt is made only by a device that has seen it
pending for the grace (`cashu/0027`), or by the sender's own resume, which
waits for the counter lock the sender holds while it sends.

## Decision

- Before the swap, under the counter lock and in one batch, Payky writes the
  pending melt, its sources `held` by it, and the reservation of the swap's
  slots, an attempt on record (cashu/0029).
- A melt the mint has not paid is settled after a NUT-07 check of its held
  proofs: held sources the mint reports spent are marked spent, and the
  swap's outputs are restored (NUT-09) from the slots the swap derived them
  from, one run with its kept outputs right after its sent ones
  (`cashu/0039`), every such reservation of the melt the mint did
  not refuse, whether or not the melt still holds a spent source; they return
  as `available` with the unspent held proofs, and the melt closes, in one
  batch. A proof the mint does not
  answer for leaves the melt `pending`.
- The first slot of each such block is read before anything else: a swap's
  outputs start there and are signed all or none. When a live block's first
  slot is unsigned, a swap of the melt's may still arrive, whatever another
  operation signed in the rest of that block. The melt then swaps what that
  swap could spend, its unspent held proofs and the restored outputs of the
  melt's blocks below the open one in its keyset, itself into outputs of its
  own, at fresh slots it reserves first in the keyset the mint signs
  with now, before it lets anything go (a fence):
  - answered, the sources are spent by the fence, its outputs are stored
    as available, and the melt is closed. The late swap is refused for
    spent inputs and signs nothing;
  - refused, nothing was signed at the fence's blocks, which are marked so,
    and the melt stays `pending`: the earlier swap has most likely spent
    the sources, and the next resume restores its block;
  - unanswered, the melt stays `pending`, and the next resume finds the
    sources spent and restores whichever block holds the outputs.

  The pre-swap and the fence go through one swap routine, which reserves
  the blocks before calling the mint and retries past a collision. A swap
  the mint refused leaves no live block, so it needs no fence. A fence the
  mint refuses for its keyset would be refused for good, so it never uses
  the keyset the melt was made in once the mint has rotated away from it.
- A held proof, or an output of the melt's swaps, that the mint reports
  spent is accounted for only by a block whose first slot was signed when
  it was read and which does not hold that proof among its outputs (a swap
  never holds its own inputs). Otherwise another device's fence spent it at
  a block whose attempt has not synced in, and the melt stays `pending`
  until it has: closed before, nothing would restore that block again.
- The exception is the sender's first call, within the grace of starting
  it, when no device can have fenced the melt yet. Settling a pre-swap that
  failed then, with none of the melt's swaps still open, takes such a spend
  for another device's melt holding the same proofs: the proof is marked
  spent, the rest comes back, and the melt closes `failed`. An open swap is the melt's own, which may still land, so
  the melt waits for it; past the window, and on any resume, the spend is
  waited out as above.
- A swap that fails is settled that way at once, closing the melt `failed`;
  when the mint cannot be asked the melt stays `pending` and the Cashu job
  resumes it (cashu/0027). The melt is never sent.
- Resuming a melt holds its counter lock, so the job never settles a melt
  this device is still swapping or sending.

## Alternatives considered

- Restoring the whole keyset on every resume: it would find the outputs, but
  scans every slot ever used where the swaps' own slots suffice.
- Marking the sources spent after a lost swap answer: the swapped value
  would still be lost.
- Keeping the melt `pending` for a grace after a lost swap answer, then
  closing it: a guess, not the mint's word, and a swap arriving later still
  loses the money.
- Replaying the same swap: a fresh swap of the sources fences it just as
  well, without depending on the late request's exact outputs.
- Bounding the wait for an unaccounted spend on every resume with a grace:
  a fence whose device went silent between the mint's answer and its
  settlement would then lose its outputs.
- Remembering every melt that ever held a proof, so the spender marks it
  spent: holds are one cell per proof (`cashu/0024`).

## Consequences

Every settlement of an unpaid melt that is not the swap's own immediate
answer costs a restore call over the reserved blocks.

A melt whose pre-swap answer was lost costs one more swap, and its input
fee (`cashu/0009`) when the mint charges one. A fence the mint keeps
refusing while the sources stay unspent leaves the melt `pending` with its
sources held, rather than risk losing them.

A swap the mint refuses, or one that never reached it, now leaves a melt
closed `failed` with its withdrawal or move closed in the same batch, where
nothing was written before. A resume waits for a melt this device is still
sending, up to the counter lock's timeout, and tries again on the next run.

A melt that started while the same proof was being spent elsewhere fails at
once rather than staying pending. It still waits when its own swap may
still land, or when the spend shows only on a later resume.

## Enforced by
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt holds only what covers it, chosen under the lock (cashu/0026) > a pre-swap refused because another device's melt spent its sources first closes the melt, never left pending (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a fence swaps every source, even one worth no more than its fee, and books none spent the mint holds unspent (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a fence another device made, its attempt not synced in yet, keeps the melt pending until it is, nothing lost (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a pre-swap block another call signed in part is fenced while its first slot is unsigned (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a melt made before the mint rotated its keyset is fenced in the new one (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a pre-swap's outputs a fence still on its way may spend are swapped again before they come back (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a fence on its way in a keyset the mint rotated to may spend outputs of any block of the old one, whatever its counter (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose sources another device marked spent first is still recovered from its slots (cashu/0019)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose outputs were never stored is recovered from its reserved slots, nothing lost`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a lost response is settled by the resume, never sent again`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose answer was lost is fenced before its sources come back (cashu/0019) > a pre-swap that reaches the mint after the fence is refused, nothing lost`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose answer was lost is fenced before its sources come back (cashu/0019) > a pre-swap that reaches the mint before the fence is restored from its slots`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose answer was lost is fenced before its sources come back (cashu/0019) > a fence whose answer was lost leaves the melt pending, and the resume restores it`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose outputs were never stored is recovered from its reserved slots, nothing lost`
