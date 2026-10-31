# 0022 A settled operation stays settled, whatever a late write leaves in its status

Status: accepted
Date: 2026-10-28

## Context

Evolu merges a row cell by cell, and the later write wins each cell. A
receive's id derives from the token text alone (`cashu/0029`), so two Payky
devices given the same NIP-17 message write one `cashuOperation` row. Device
A can complete the receive, writing `done` and `settledAt`, while device B,
which has not seen A's rows yet, writes its `pending` and its counter
reservation. B's swap then finds the token spent and writes nothing more,
but its `pending` is the later write: once both sync, the operation reads
`pending` on every device, the listener keeps trying the message, and
anything that reads the status shows the receive unsettled. The proofs and
the booking A wrote are unaffected; only the status lies.

## Decision

- `settledAt` is the fact that an operation completed. Only the batch that
  completes it writes it (`done` for a receive or a topup, `paid` for a
  melt), and no write clears it: creating an operation writes neither
  `settledAt` nor `counter`, which belongs to the reservation.
- An operation with `settledAt` reads as settled, `done` or for a melt
  `paid`, whatever its `status` cell holds. The guards' loaders apply this,
  so every action and job reads the status the devices agree on, and the
  queries for pending topups and melts skip a settled row.

## Alternatives considered

- Re-reading the row just before writing `pending`: it narrows the window,
  but sync between devices is asynchronous, so it cannot close it.
- Keeping the status per device, as the counter reservations are kept per
  attempt (`cashu/0029`): an operation has one outcome, and every reader
  would have to merge the devices' rows back into it.

## Consequences

A `status` cell can disagree with `settledAt`; read an operation through the
guards' loaders (`loadCashuReceive`, `loadCashuTopup`, `loadCashuMelt`,
`loadCashuOperation`), never its raw `status`. A late `failed` cannot hide a
completion either; a receive is never written `failed` at all
(`cashu/0029`).

## Enforced by

- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a settled receive stays settled > another device's pending, written after the receive completed, leaves it done`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a settled receive stays settled > another device's failed, written after the receive completed, leaves it done`
