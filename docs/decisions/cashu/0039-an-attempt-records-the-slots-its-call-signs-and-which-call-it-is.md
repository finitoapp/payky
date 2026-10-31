# 0039 An attempt records exactly the slots its call asks the mint to sign, and which call it is

Status: accepted
Date: 2026-10-30

## Context

An attempt on record (`cashu/0029`) names the NUT-13 slots of one call: a
topup's claim, a receive's swap, a melt's pre-swap or fence (`cashu/0019`),
or a melt request's blank outputs (`cashu/0027`). A call asks for few
outputs, a handful for a topup or a token, and a melt request's blanks may
be none.

A device recovering from a collision starts past the last signed slot, and
a device's first use of a keyset starts past the last signed slot too
(`cashu/0029`, `cashu/0031`). Slots an attempt names but its call never
signs are therefore slots another device may sign next, and a reclaim then
has to guess whose a signed slot is, by its block's first slot and by the
other operation's state at the mint (`cashu/0029`, `cashu/0038`). The Cashu
simulation (`packages/core/src/testing/cashu-simulation.ts`) found such
guesses going wrong whenever an attempt named more than its call:

- A closed topup's block named slots where another topup's lost claim had
  signed. The reclaim took those outputs for the closed operation's and
  left the topup pending for good, its money unbooked.
- A melt request asking for no change, given slots anyway, shared them with
  another device's topup. The melt's quote read UNPAID while its request
  sat in the mint's queue, so the reclaim refused the melt's blanks; with
  no live blanks left, the melt read as never sent and closed `unpaid`,
  and the late request then paid the invoice with inputs let go as
  available.

A melt has two kinds of call, and every reader needs to tell them apart:
which attempts a resume restores, whether the melt may have gone out, and
whether its call could have signed a shared slot.

cashu-ts prepares every call before it sends it (`prepareMint`,
`prepareSwapToReceive`, `prepareSwapToSend`, `prepareMelt`), so the outputs,
and with them their number, are known before anything is written.

## Decision

- Every call is prepared first, under its counter lock. Its attempt then
  records exactly the slots the prepared call asks the mint to sign, from
  its first slot, in the batch written before the mint is called; the
  counter moves past them. The count comes from cashu-ts's own preparation,
  never from Payky's arithmetic.
- A melt's pre-swap puts its kept outputs right after its sent ones, so one
  attempt covers one run of slots. It is prepared once more to learn where
  the sent ones end; preparing is deterministic and asks the mint nothing.
- A melt request records its slots even when it asks for no change: an
  attempt of no slots. That record is what says the request may have gone
  out (`cashu/0027`), and with no slots it shares none, so no other call's
  reclaim can refuse it.
- An attempt's row is one call's: a device that reserves again at a slot
  its own row names, a resume, reuses that row only for a call of the same
  role. A melt request that asks for no change leaves the counter where it
  was, so its melt's fence starts at the same slot; the fence gets a row of
  its own, and the request stays on record as sent, whatever the mint
  answers the fence.
- Each attempt records its role: `mint` (a topup's claim), `swap` (a
  receive's swap), `meltSwap` (a melt's pre-swap or fence) or `meltChange`
  (a melt request's blank outputs). Every reader tells a melt's calls apart
  by role, never by size: which attempts a resume restores, whether a melt
  may have gone out, and how another operation's reclaim asks whether that
  call could have signed (`cashu/0029`).
- A reclaim counts each output once, whichever attempts of the operation
  name it.

## Alternatives considered

- A fixed block per call, 64 slots, two for a melt's pre-swap: simpler
  arithmetic, but most of each block is named by a call that never signs
  there, which is what made the guesses above go wrong.
- Telling who signed a shared slot from the run of signed slots starting at
  each call's first slot: after a collision's recovery, a call starts right
  after the last signed slot, so two operations' runs touch and the run
  says nothing.
- Computing a call's output count from its amount when the attempt is read:
  it repeats cashu-ts's split and fees, which `cashu/0026` declined for the
  same reason.
- Telling a melt's calls apart by the size of their attempts: a size tells
  nothing once it is a call's own count.

## Consequences

Blocks overlap only where two calls really asked for the same slots: a call
started by a device that did not know another's slots were taken, or one
whose refusal never reached its device. Every restore reads a call's own
slots.

A slot another operation's attempt names is one its call asked to sign, so
`cashu/0038` judges a stored output there by that operation alone.

Preparing a call may fail before anything is written: nothing is reserved
then. A melt request that cannot be prepared after its pre-swap closes the
melt `failed`, its inputs back as the swap left them: nothing was sent.

## Enforced by

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > an attempt records exactly the slots its call asks the mint to sign, and which call it is (cashu/0039) > a melt request that asks for no change stays on record whatever another call signs at its counter, so a lost one is never closed as never sent`
- `packages/core/src/background-jobs/jobs/cashu-simulation.test.ts > cashu simulation > a closed operation's call never claims slots past its own outputs, so a lost claim beyond them is booked (cashu/0039)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > outputs in slots only an operation's block names are its own, stored or not (cashu/0038) > a lost claim whose outputs another device's first-use restore stored is booked and closed, never left pending`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > an attempt records exactly the slots its call asks the mint to sign, and which call it is (cashu/0039) > a fence at the counter of a melt request that asked for no change gets a row of its own, so a refused fence leaves the request on record`
