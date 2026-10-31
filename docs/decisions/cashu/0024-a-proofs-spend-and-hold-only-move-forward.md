# 0024 A proof's spend and hold only move forward; a restore writes its identity alone

Status: accepted
Date: 2026-10-29

## Context

Evolu merges a row cell by cell, and the later write wins each cell. A proof
used to carry its state in one `state` cell, and every path that stored a
proof wrote the whole row: a NUT-09 restore of a keyset, the reclaim of a
lost swap or claim, a melt's change. Each wrote `available` with no
`operationId`.

Device A swaps for a withdrawal, stores the swap's outputs `held` by melt M
and sends the melt. Device B, which has not seen those rows yet, restores
the keyset on its first use of it; the mint reports A's outputs unspent, so
B stores them `available`. B's write is the later one. Once it syncs, A's
`settlePaid` finds no proof held by M, the spent proofs stay `available` on
every device, the balance shows money that is gone, and the next melt fails
with "already spent".

## Decision

- A proof's state is read from two cells, never stored as one: `spent` once
  `isSpent` is set, else `held` while `operationId` names a melt, else
  `available`.
- `isSpent` is only ever written true and never cleared, so a spend
  outranks every later write of the row, whichever device made it.
- Only the melt that holds a proof writes its `operationId`: it holds its
  sources and its inputs, and lets go of what it does not spend.
- Every other path that stores a proof — a keyset restore, a reclaim, a
  receive, a claim, a melt's change and the swap's outputs — writes the
  proof's identity alone: its id, mint, keyset, amount, secret, `C` and
  DLEQ, cells derived from the secret that every device writes alike. A
  proof stored before keeps the hold and the spend another device wrote.

## Alternatives considered

- Keeping `state` and re-reading the row before writing it: sync is
  asynchronous, so a re-read narrows the window and cannot close it.
- A timestamp per state cell, the newest state winning: the newest write is
  exactly the restore that knows least.

## Consequences

A proof new to this device reads `available` until the hold or spend of the
device that made it syncs in. Reads go through the queries that derive the
state (`availableCashuProofsAtMintQuery`, `heldCashuProofsOfOperationQuery`,
`cashuBalancesQuery`), never a `state` column.

A melt's release of its held proofs still writes `operationId` last-write-
wins: two melts holding one proof on two devices is not resolved here.
`cashu/0019` settles the melt whose pre-swap such a spend refused.

## Enforced by

- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > a proof's state only moves forward (cashu/0024) > a restore written after another device's hold leaves the proof held`
- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > a proof's state only moves forward (cashu/0024) > a spent proof stays spent whatever is written after it`
- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > cashu counters > a device's first use of a keyset restores it and starts past the last signed slot`
