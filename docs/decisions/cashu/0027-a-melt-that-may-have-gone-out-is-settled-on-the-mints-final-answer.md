# 0027 A melt that may have gone out is settled only on the mint's final answer

Status: accepted
Date: 2026-10-29

## Context

Only the device that sent a melt resumed it, because only that device
holds `_cashuOwnAttempt`, which stays on the device. A melt left pending by
a phone that was then lost, wiped or reinstalled was never settled: its
held proofs stayed out of the balance on every device, and its withdrawal
showed neither paid nor failed.

Topups and receives are taken over past a grace (`cashu/0017`). A melt
needs more care, since its sender may still be working on it. The dangerous
case is a melt closed `unpaid` on another device while its sender then
sends it: the withdrawal would read failed while the money left.

The same doubt holds for a melt this device sent and lost the answer to: a
timeout or a dropped connection. The mint's UNPAID says only that it has
not started paying; a request the device gave up on may still be in a
proxy or the mint's queue. Taken as final, it let the inputs go, and the
late request then paid the invoice with proofs the wallet counted as
available: the withdrawal read failed while the money left, a retry paid
twice, and the next operation picking those proofs failed on them.

Some mints answer a melt quote with no expiry, so waiting for it to expire
never ends. Such a melt, its request lost and the mint answering UNPAID,
stayed `pending` for good, its held proofs out of the balance on every
device and its withdrawal or move never ending.

A device that settles a melt reads the rows that reached it. The sender
writes a second batch once its pre-swap answers: the melt's inputs held,
the swap's kept outputs stored, the consumed sources spent, the kept ones
let go, and `inputsTotal` set to the inputs. When that batch never synced
in, the melt still holds every source and `inputsTotal` is their total, so
settling from the rows would mark every source spent, never restore the
kept outputs, and book the sources' total as the withdrawal.

Some answers to a melt request carry a NUT-00 code and still say the melt
may be paying. A proxy or transport that retries the request delivers a
second copy while the mint pays the first; the copy is answered 20005
(quote pending), 11002 or 11012 (proofs pending), or 20006 (invoice already
paid) once the first finished. Taken as a refusal, the melt was closed
`failed`: its blanks' block refused, so its change could never be
restored, and its held inputs, which NUT-07 reports `PENDING`, let go as
available, while the first request paid the invoice.

## Decision

- The Cashu job resumes a pending melt another device sent once a grace,
  `CLAIMED_ELSEWHERE_GRACE_MS`, has passed since it first saw it. It never
  sends the melt again, as `withdraw/0013` had it for the sender alone.
- It settles the melt only on an answer the sender cannot change any more:
  - PAID: the melt is `paid`, its change restored from the blank outputs'
    block, and its owner's rows written. Its held proofs are checked
    (NUT-07): those the mint reports spent are marked spent, unspent ones
    are let go, and the pre-swap's outputs no device stored are restored
    from its blocks. What it books as spent is `inputsTotal`, less the
    change, the proofs let go and the outputs restored. A proof the mint
    does not answer for leaves the melt `pending`.
  - UNPAID once the quote expired, plus a grace for a clock ahead of the
    mint's: the mint will no longer pay it, so the held proofs come back and
    the swap's outputs are restored from the pre-swap's blocks
    (`cashu/0019`).
  - UNPAID for a quote that states no expiry, once
    `CLAIMED_ELSEWHERE_GRACE_MS` has passed since the judging device first
    saw the melt pending, or since the melt was written
    (`cashuOperation.createdAt`) when that is earlier: its held proofs the
    mint reports unspent, and the restored outputs of the pre-swap blocks
    below its blanks' block (every restored output when no blanks' block is
    known here), are fenced first, swapped into outputs of the melt's own
    as `cashu/0019` fences a pre-swap, so no request still on its way can
    spend them; then the melt closes `unpaid`. A device holding only the
    melt's first batch holds the sources the pre-swap spent, while the
    request's inputs are among the outputs it restores. A fence the mint refuses,
    because the request arrived first, or one that goes unanswered, leaves
    the melt `pending` for the next resume.
  - Anything else, PENDING or UNPAID before that, is left to its sender.
- The same holds for a melt this device sent once it may have gone out: its
  blanks' block is reserved, which a melt does before it calls the mint.
  UNPAID closes it at once only when it never went out: this device sent
  it, holds its counter lock, and reserved no blanks' block, as after a
  failed pre-swap. A refusal of the melt request settles it `failed`
  after a NUT-07 check of its held inputs: those the mint reports spent,
  by another device's fence, are marked spent, not let go. A device whose only attempts at the melt are fences it
  reserved taking the melt over did not send it: each device marks its own
  fences in `_cashuOwnAttempt`, which stays on the device. The mint's own answer to the melt call, UNPAID or a
  refusal, still closes it at once: that request is done.
- A refusal that says the melt may be paying, its quote pending or paid or
  its inputs pending (`isMeltUnderWay`, `cashu/0037`), is no such answer,
  and neither is any refusal whose held inputs NUT-07 reports `PENDING`, a
  copy of the request being paid. The melt is not settled on it: its
  blanks' block stays unrefused, its inputs held, and it is resumed as
  after a lost answer, its quote's state settling it.
- One verdict, `judgeUnpaid`, decides final, fence or wait for the resume
  of every melt.
- A melt records its quote's expiry (`cashuMelt.expiresAt`).
- Resuming finds a melt's attempts by their role (`cashu/0039`), the
  pre-swap's and the blank outputs', whichever device reserved them, instead of this
  device's latest attempt.

## Alternatives considered

- Booking the quote's amount and fee reserve: the reserve is an upper bound,
  and the input fees would still be missing.

- Taking over on any answer past a grace, as topups do: a sender still
  working on the melt could pay it after the takeover closed it `unpaid`.
- Leaving it to the merchant: nothing on screen says which melt holds the
  balance.
- Checking the inputs' NUT-07 state after a lost answer: they read
  `pending` only while the mint is paying, not while the request is still
  on its way.
- Fencing every melt whose answer was lost at once, expiry or not: it ends
  the wait sooner, but a quote with an expiry ends it without a fee.
- Treating a missing expiry as a default one: a mint that sets none may
  still pay the quote after any default, and the money would leave while
  the withdrawal read failed.
- Keeping every coded answer final and relying on NUT-07 alone: an invoice
  already paid leaves its inputs `SPENT`, not `PENDING`, and its change
  would still be lost to the refused block.
- Settling 20006 as paid at once: the answer carries no change and no
  preimage; the quote's state carries both.

## Consequences

Two devices settling the same paid melt write the same rows: `settledAt`
stands (`cashu/0022`), the proofs are written by identity (`cashu/0024`), and
the withdrawal's transaction id is the withdrawal's own.

Resuming a paid melt costs a state check and a restore call more. A
pre-swap block shared with another open operation leaves it `pending` until
that operation closes (`cashu/0029`).

One gap is left. When the sender's second batch never synced in and this
device had already stored the kept outputs by another path, a first-use
keyset restore, the restore finds nothing new and the withdrawal is booked
that much too high. The balance is still right.

A withdrawal or move whose melt answer was lost reads pending until the
mint pays it or its quote expired, minutes to tens of minutes, instead of
failing at once. At a mint whose quotes state no expiry it costs one more
swap and its input fee (`cashu/0009`); a request that reaches the mint
after the fence is refused for spent inputs, so the invoice stays unpaid
and the withdrawal reads failed, as the merchant was told. That grace
counts from when the judging device first saw the melt, by its own clock,
or from `createdAt`, the sending device's clock, when that is earlier: a
sender's clock ahead no longer holds the fence back on every device, and a
sender's clock behind shortens it, which costs no money, the fence only
turning a late payment into a refused one. The job keeps the first sight in
memory, so a restart counts it again unless `createdAt` is older.

A mint that answers 20006 because another quote paid the same invoice
leaves this melt `pending` until its quote expires or its grace passes and
it is fenced, its inputs out of the balance meanwhile. That costs time, not
money.

## Enforced by

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt request refused with an answer that says it may be paying is settled on the quote's state (cashu/0027) > %s: the inputs stay held, and the melt is paid with its change once the original lands`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a lost response stays in progress until the resume settles it; it is never sent again`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a melt the mint does not pay marks the withdrawal failed`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a lost response is settled by the resume, never sent again`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a melt request refused because another device's fence spent its inputs never lets them go as available (cashu/0027)`

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > a device holding only the melt's first batch fences the pre-swap's outputs, so the sender's late request is refused (cashu/0027)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt lets nothing go that a call still on its way may spend (cashu/0019, cashu/0027) > the grace before a fence counts from when the melt was first seen, whatever the sender's clock says (cashu/0027)`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > a melt this device only fenced is still another device's: its refused fence never lets the inputs go (cashu/0027)`

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt its sender left is settled only on the mint's final answer (cashu/0027) > PAID whose sender's later writes never synced in: the swap's kept outputs come back and only what left is booked (cashu/0027)`

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > what a melt books is what left the balance (cashu/0027) > a melt books what left the balance, the pre-swap's input fee included`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > what a melt books is what left the balance (cashu/0027) > a melt settled by a resume that never saw its pre-swap's batch books the same`

- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a melt another device sent and left, once the mint paid it, never sending it again (cashu/0027)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt its sender left is settled only on the mint's final answer (cashu/0027) > PAID is settled, the change restored from the blanks' block, nothing sent again`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt its sender left is settled only on the mint's final answer (cashu/0027) > UNPAID is left to the sender until the quote expired, then the proofs come back`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt that may have gone out is closed unpaid only once its quote expired (cashu/0027) > UNPAID after a lost melt request keeps the inputs held`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt that may have gone out is closed unpaid only once its quote expired (cashu/0027) > a request that reaches the mint after the check is settled paid`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt that may have gone out is closed unpaid only once its quote expired (cashu/0027) > once the quote expired, the inputs come back`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a pre-swap whose outputs were never stored is recovered from its reserved slots, nothing lost`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt whose quote states no expiry is fenced once a grace has passed (cashu/0027) > a lost request waits out the grace, then the fence returns the inputs and the late request is refused`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt whose quote states no expiry is fenced once a grace has passed (cashu/0027) > a melt another device sent and left is fenced past the grace`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt whose quote states no expiry is fenced once a grace has passed (cashu/0027) > a request that reaches the mint before the fence is settled paid`
