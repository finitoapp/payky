# 0026 A melt holds only the proofs that cover it, chosen under the counter lock

Status: accepted
Date: 2026-10-29

## Context

Before its pre-swap a melt writes itself pending with its sources `held`
(`cashu/0019`). It took every available proof at the mint as a source and
let cashu-ts pick, inside the swap, the ones it needed; the rest came back
only once the swap's outputs were stored. A melt whose swap answer was lost,
and whose proofs the mint could not then be asked about, stayed pending
holding the whole balance at that mint: a 1 000 sat withdrawal from 100 000
left nothing to spend or move until it was resolved.

The sources were also chosen, and their NUT-07 states checked, before the
melt took the counter lock. A second melt from the same mint on the same
device worked from that stale selection: once the first melt's swap spent
or held the proofs, the second held them again under its own id and its
swap failed on inputs already spent.

## Decision

- A melt selects its sources under the counter lock of its mint and
  keyset: the NUT-07 check, marking the spent ones, the price check against
  the total the merchant confirmed (`cashu/0023`), and the selection.
- It holds only the proofs that cover it: cashu-ts prepares the swap
  (`prepareSwapToSend`) before anything is written, its inputs are the
  melt's sources, and the swap sent is that very preparation
  (`completeSwap`). A retry past a collision prepares it again over the
  same sources.
- The swap returns the proofs it left out as they were; only those the melt
  held are let go, and those it never held are not written again.

## Alternatives considered

- Picking the subset in Payky's own code: it would have to repeat cashu-ts's
  selection and fee arithmetic exactly, or the swap could pick inputs the
  melt does not hold.
- Holding everything and releasing sooner: the window that matters is the
  one where the swap's answer is lost, and nothing can be released before
  the mint is asked again.

## Consequences

Two melts from one mint on one device run one after the other. Two devices
may still select the same proof; the mint refuses the second swap, and the
spend outranks the other device's hold (`cashu/0024`), and the pre-swap's
outputs are restored whether or not the melt still holds a spent source
(`cashu/0019`).

## Enforced by

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt holds only what covers it, chosen under the lock (cashu/0026) > a melt left pending holds the proofs that cover it, the rest stays spendable`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt holds only what covers it, chosen under the lock (cashu/0026) > two melts started together from one mint each pay, neither taking the other's proofs`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose outputs were never stored is recovered from its reserved slots, nothing lost`
