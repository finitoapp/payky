# 0038 Outputs in slots only an operation's block names are its own, stored or not

Status: accepted
Date: 2026-10-30

## Context

A reclaim restores the blocks of an operation's attempts and takes what the
mint signed there (`cashu/0029`). A block no other operation's block
overlaps gives the operation every output signed in it, stored already or
not. A block another operation's block overlaps gave it only the outputs no
one had stored: a closed operation stored whatever it signed, so a stored
output there was taken for that operation's.

A keyset restore stores outputs too, with no booking: a device's first use
of a keyset (`cashu/0029`). Device A's claim is signed and its answer lost.
Device B uses the keyset for the first time, its restore stores A's outputs,
and B's own block starts past them, inside A's block. A's reclaim then found
every output of its block stored, took none, and answered that another
device claims the topup, with no attempt of that device's to take over. The
topup stayed pending for good, polled and restored every five minutes, and
its money sat in the wallet unbooked: a payment's topup never read paid.
The Cashu simulation (`packages/core/src/testing/cashu-simulation.ts`)
found it.

The mint signs a slot once. A slot that no other operation's block names
can hold no other operation's output, except one whose attempt has not
synced in yet, the gap `cashu/0029` already leaves open.

## Decision

- A reclaim takes, besides the outputs no one stored, every output already
  stored in a slot of its block that no other operation's block names, as a
  block no one shares gives them. Outputs in shared slots are judged as
  before (`cashu/0029`).
- Finding such outputs completes the operation: a topup or a receive closes
  `done` with its booking, its proofs stored already.
- The overlaps are restored for this only when the block holds stored
  outputs, so a reclaim that finds none stored asks the mint nothing more.

## Alternatives considered

- Taking every stored output of the block: one a closed operation signed in
  a shared slot would be booked twice.
- Not storing outputs in a first-use restore until their operation is
  known: the restore cannot know it, and the balance would miss them
  meanwhile.
- Telling a restore's unbooked outputs apart by a mark on the proof: a proof
  row carries only its identity (`cashu/0024`), and a mark would be one
  more cell any device may overwrite.

## Consequences

A reclaim of a shared block holding stored outputs costs one restore call
per overlapping block more.

A slot another operation's block names is one that operation's call asked
the mint to sign (`cashu/0039`), so the stored output there may be its.

## Enforced by

- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > outputs in slots only an operation's block names are its own, stored or not (cashu/0038) > a lost claim whose outputs another device's first-use restore stored is booked and closed, never left pending`
