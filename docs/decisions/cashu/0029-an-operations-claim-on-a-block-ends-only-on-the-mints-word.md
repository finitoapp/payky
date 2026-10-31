# 0029 An operation's claim on a block ends only on the mint's word, never on a status

Status: accepted
Date: 2026-10-29

## Context

`cashu/0012` gave Payky a wallet of its own. Only Payky devices of the same
account write it, and they write it offline and at the same time. Evolu
merges a row cell by cell, and the later write wins each cell, so a cell
any device may overwrite proves nothing to a reader. `cashu/0022` found
this for `done`: a later `pending` hid a completed receive, and
`settledAt` became the fact a completion stands on.

Every device derives its outputs from the account's seed, so any device can
restore any device's outputs through NUT-09, given the keyset and the slots.
A single counter cell on the operation would keep only the later of two
reservations made at the same moment. If the device whose reservation was
lost had its outputs signed and then lost the answer, no device would know
where they are. Devices keep their counters locally, and recovering from a
collision jumps past the last signed slot, so blocks of two operations can
share slots. The mint signs a slot once.

Keeping every attempt on record is not enough on its own. A design that
left three things to the operation's `status` failed at each of them:

- A receive's `failed` hid every device's attempts. Device A, whose swap the
  mint refused because device B's swap of the same token was still in
  flight, wrote `failed` later than B's `pending`. B's swap was signed and
  its answer lost. Every later run read `failed`, reclaimed from no attempt,
  and reported the token received elsewhere: the sats signed at B's slots
  were never stored and the payment stayed unpaid.
- An operation counted as open while its `status` read `pending`. A receive
  whose token Linky spent stays `pending` for good, because no device may
  write `failed` over a possible `done`. Every other operation whose block
  shared a slot with one of its attempts the mint had not refused failed
  `CashuReclaimAmbiguous` on every run, for good.
- Two operations sharing a signed block each saw the other as open, so
  each waited for the other to close. Neither ever did: a deadlock, with
  the sats at the mint, in no one's wallet.

A refused attempt also read as another device working on the operation,
so a device waited out the whole grace (`cashu/0017`) for a block the mint
had already refused.

Two further gaps showed once contests were settled. A receive whose token
another wallet spent stays open with a reserved, unsigned block, and its
spent token made it a candidate for any signed slots another operation's
block shared with it: it contested outputs it had never signed, on every
pass, until they were given to no one. And a contest given to no one was
known only to the reclaim that settled it: the other side found nothing of
its own afterwards and read `receivedElsewhere`, telling the merchant
another wallet took money that sat in Payky's wallet unbooked, or, for a
topup, answered `claimedElsewhere` with nothing to wait for and stayed
`pending` for good while its payment showed the QR again.

The mint does answer what decides all three. A token's proofs are spent or
not (NUT-07). A mint quote is `ISSUED` or not (NUT-04). A block holds
signatures or not (NUT-09). A swap and a mint sign their outputs
atomically, and a slot is signed once.

## Decision

- An operation is read through monotone facts only:
  - `settledAt`: it completed (`cashu/0022`);
  - an attempt: its outputs may sit in that block;
  - an attempt's `isRejected`: nothing in that block is left for that
    operation, for good.

  `status` is a hint for display. No guard and no reclaim branches on it,
  except a topup or melt closed `failed` on the mint's own final answer
  (this record, `cashu/0027`).
- A receive is never written `failed`. When the mint refuses a swap, this
  device's freshly reserved attempt is marked `isRejected` and the refusal
  goes to the payment's arrival. A receive with no `settledAt` reads
  `pending`, whatever its `status` holds, `failed` rows already written
  included.
- A receive is open while it has no `settledAt` and has an attempt not
  refused. A topup or melt is open while it has no `settledAt` and its
  `status` is `pending`. Only an open operation can make a shared block
  ambiguous.
- Every attempt on record is read whenever the operation is not settled,
  whatever its `status`. Only another device's attempts not refused count as
  its work, for the grace (`cashu/0017`) and for "claimed elsewhere"; an
  attempt of this device's own, refused or not, means this device works on
  the operation too.
- The claim of a topup and the swap of a token reserve their block, the
  NUT-13 slots the prepared call asks the mint to sign (`cashu/0039`),
  before the mint is called. Each reservation is a
  `cashuOperationAttempt` row of the reserving device, with an id of its
  own, also for a block another device reserved too. A device reuses its
  row only to resume that block. The local `_cashuOwnAttempt` marks this
  device's rows, and taking over another device's block (`cashu/0017`)
  reserves it again as a row of this device.
- An attempt is marked `isRejected`, and a mark is never cleared, when any
  of the following holds for its block:
  1. The mint refused the one call this run made with a block it reserved
     fresh, answering with a NUT-00 code. This marks only that device's own
     row. An answer that would not parse, a proxy's 4xx, or a failure to
     unblind a signed answer marks nothing: the mint may have signed.
  2. The operation's call can no longer sign anything (its token was spent
     or its quote `ISSUED`, learned first), and a NUT-09 restore made after
     that holds no signature in the block. Every row of the operation naming
     the block is marked, by whichever device learned it.
  3. A restore showed signatures where the block overlaps another
     operation's, the operation's state, asked of the mint after that
     restore, says its call never signed (a token unspent, a quote
     `UNPAID`), and the block's first slot is signed. A call's outputs start
     at its block's first slot and are signed all or none, so no call of the
     operation can sign there any more. Every row of that operation naming
     the block is marked, also when the reclaim was another operation's.
  4. The block was contested and given to no one (below), nothing of its
     operation's that no one stored is left anywhere in it, and no call of
     its can sign there any more: for the reclaiming operation its call can
     no longer sign, for another its block's first slot is signed.

  A block that was resumed or taken over is marked only on grounds 2 to 4:
  an earlier call with that block may have been signed.
- A reclaim restores every block not refused that it may reclaim from (its
  own at once, another device's once the grace is over, `cashu/0017`), each
  block once, at its own keyset, all at once. For a signed block that open
  operations' attempts not refused also share, it asks the mint, after the
  restore, which of the operations could have signed it. A receive could
  have unless its token is unspent. A topup could have unless its quote is
  `UNPAID`: a mint signs a quote's outputs before the quote reads `ISSUED`.
  A melt's pre-swap block (role `meltSwap`) could have unless every
  proof the melt holds is unspent: the pre-swap spends its sources, and
  once its outputs are stored they are no one's to contest. A melt's blank
  outputs (role `meltChange`) could have unless its quote is `UNPAID`:
  change is signed only with the payment. Only the outputs in the slots an operation
  shares count against it; the rest of the block is the reclaiming
  operation's.

  Before its state, an operation is judged by its block's first slot,
  restored after the shared slots were seen signed. Unsigned, its call
  signed none of them, whatever its state says: a call's outputs start at
  that slot and are signed at once, so a call signing later finds the
  shared slots taken. It is no candidate, keeps its block, and the mint is
  not asked for its state. Signed, its state decides as above.
  - **One candidate:** that operation takes the block. Every other one's
    rows naming it are marked when ground 3 holds.
  - **None:** the signer is closed or not synced in yet. The block keeps the
    outputs no one stored, as for a block shared only with closed
    operations.
  - **Two or more** (contested): the reclaim fails `CashuReclaimAmbiguous`
    and is tried again. Once the contest has stood for the grace, counted
    as `cashu/0017` counts it (a takeover that led to it holds while it
    stands), the contested outputs, unstored and unspent, are stored in the
    wallet without a booking, and the blocks ground 4 allows are marked. A
    receive whose token paid a payment reports it to the payment's arrival
    as contested. Every row naming a block of any side of the contest gets
    `isContested` in the batch that stores the outputs, whichever
    operation's reclaim settled it; the mark is monotone like `isRejected`.
    A receive that finds nothing of its own and waits for no other device
    reads `contested` when its rows carry the mark. A topup in that state,
    its quote `ISSUED`, answers `contested` and is closed `done` with
    `settledAt` and no booking, so the job polls it no more, whatever other
    devices' attempts are on record: every block on record was restored
    after the quote read `ISSUED`, so none can sign any more. A device
    holding an attempt of its own at a topup closed that way, not marked
    refused or contested, restores it once per run of the Cashu job: a claim
    of its that the mint signed where no device looked before the close goes
    into the wallet with the topup's booking, its status and `settledAt`
    left as the close wrote them (`cashu/0022`); the wait
    screen of a payment holding its quote (`cashu/0036`) says beside the QR
    that a Lightning payment landed in contested slots, read from the
    synced hold and mark. The token listener counts the grace for a receive, and
    the Cashu job for a topup and for a melt, so a contest settles from
    whichever side still runs, a melt's included.
- A signed block that closed operations alone share keeps the outputs no
  one stored: a closed operation stored whatever it signed.
- A device with an attempt of its own resumes at its latest one not refused,
  in the keyset it works in, whatever attempts other devices added since.
- A topup is closed `failed` only when the mint confirms `UNPAID` and this
  device's clock stands past the quote's expiry plus
  `CLAIMED_ELSEWHERE_GRACE_MS` (5 minutes).
- Collisions with another device's slots are recovered past the last signed
  one. A device's first use of a keyset restores it (NUT-09) and starts past
  what is signed, and `cashu/0031` moves it past the attempts on record too.
- A token another wallet already spent (Linky on the same npub, or a
  customer's double spend) is `receivedElsewhere` once no block on record
  holds its outputs. The marks above are written, the operation's row is
  not, and the payment stays unpaid. The merchant settles it; the money is
  in their Linky.

## Alternatives considered

- Judging a sharing operation by its state alone: an operation whose call
  can no longer be ruled out contests slots it never signed.
- Telling the other side of a contest by the outputs stored unbooked: the
  wallet does not record which operations contested them, and a keyset
  restore stores outputs unbooked too.
- Closing a contested topup `failed`, or with a status of its own: the
  money arrived, and `status` is a hint while the mark is the fact.

- Loading the attempts whatever the `status`, and keeping `failed`: it fixes
  the one reader that hid them, and the next reader to branch on `status`
  falls into the same trap.
- A closing column of its own (`abandonedAt`): a new cell no device could
  write without the mint's word, which is exactly what the marks already
  record per block.
- Renaming `isRejected` to say what it now means: Evolu cannot rename a
  column, and a second column would split one fact in two.
- Breaking a contest by the outputs' sum: two payments of one price at one
  slot cannot be told apart, and a block two calls share in part matches
  neither.
- Breaking a contest by a deterministic rule, such as the older operation:
  it books money to a payment that may not have received it.
- Leaving a contest to the merchant with the outputs still at the mint: a
  restore of the keyset would store them unbooked anyway, and until then
  they count in no balance.
- One attempt id derived from the operation, keyset and slot, so that two
  devices reserving one block write one row: one device's refusal would mark
  the other's signed call.
- Marking refusals in a local-only table: other devices would reclaim blocks
  the mint refused.
- Reading the mint's clock for a topup's expiry: not every mint sends one.
- Disjoint ranges of the counter per device: see `cashu/0031`.

## Consequences

The facts are read in their order: what the mint says about an operation
counts only when asked for after the restore it judges (grounds 2 and 3).
Each mistaken answer errs on the safe side. A token spent after the restore
counts as one that could have signed, which makes at worst a contest and
never a wrong assignment.

One gap is still open. An attempt that has not synced in
yet is invisible: its operation shares nothing, and a contest is settled
without it. The grace before a contest is given to no one narrows that gap
but does not close it. The real signer then finds its outputs stored and
unbooked, as after a restore of the keyset. A topup's claim signed at such
an attempt is the exception: its own device reclaims and books it once the
close syncs in, and the topup's payment may then hold a booking besides
whatever the merchant settled meanwhile.

A contest given to no one leaves sats in the wallet with no booking, and a
receive's or a topup's payment unpaid until the merchant settles it. A
contest needs every contester to have signed its block's first slot, and a
reclaim asks the mint one call less for each sharer whose first slot is
unsigned.

A melt whose contested outputs are given to no one settles without them:
change given away is booked as spent with the withdrawal, so its fee reads
higher by that much while the sats sit in the wallet unbooked.

A melt whose answer could not be read is asked about again, as a lost one
is, and never closed `failed` on it: only a mint's coded refusal says
nothing was paid.

A topup with its quote `ISSUED` and every attempt refused is still polled.

The owner is advised not to run Linky on the same key while working the
till: a quicker Linky takes the token and the payment shows unpaid.

Reclaiming costs one restore call per block not refused, plus one state
check per open operation sharing a signed block. Two devices can settle one
operation from the same block: the proofs' ids derive from their secrets and
the booking's id from the operation (`cashu/0014`), so both write the same
rows.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > reclaims and books its own claim at a topup another device closed as contested (cashu/0029)

- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a block's claim ends on the mint's word (cashu/0029) > a claim signed at a block the contested close never saw is reclaimed and booked by the device that made it (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a block's claim ends on the mint's word (cashu/0029) > a contested topup's own block that holds nothing is refused by the reclaim, never scanned again (cashu/0029)`

- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a status is no fact (cashu/0029) > another device's signed swap is reclaimed though a refusal on this device came after it`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a status is no fact (cashu/0029) > a mint refusal marks this device's attempt and writes no failed`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a status is no fact (cashu/0029) > a failed written before reads as pending`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a status is no fact (cashu/0029) > another device's refused attempt is not waited for`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a spent token's empty blocks are refused, and the operation sharing them is reclaimed`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a topup whose quote is unpaid gives the block to the receive`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a topup whose quote is paid, its mint call perhaps in flight, contests the block`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > an operation whose call never signed keeps its block while no call has signed its first slot`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a call that signs its first slot right after it was read keeps its block`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > an answer that a call never signed is asked again for each row naming its block`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a contest refuses another operation's block only where nothing of its is left`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a swap whose answer could not be read leaves its block on record, and is reclaimed`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a contest reached only by taking another device's attempt over is settled past its grace (cashu/0029)`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a topup's contest reached only by taking another device's claim over, past its grace (cashu/0029)`
- `packages/core/src/background-jobs/jobs/cashu-account-sync-job.test.ts > cashu account sync job > settles a melt whose change block is contested, past its grace, with no receive left to do it (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a melt whose quote is unpaid gives its blank outputs' block to the receive`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a melt whose held proofs are unspent gives its pre-swap block to the receive`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt whose answer could not be read is asked again, never closed failed (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a block's claim ends on the mint's word (cashu/0029) > a receive whose token is not spent gives the block to the topup`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a block's claim ends on the mint's word (cashu/0029) > a contest is ambiguous within the grace, and past it stored unbooked and refused for both`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a contested block is shown on the payment, and the message is settled (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a slot holds the outputs of one operation (cashu/0029) > a block the mint refused is never reclaimed, though another operation's outputs sit there`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a slot holds the outputs of one operation (cashu/0029) > a lost swap whose block an open operation shares waits, and is reclaimed once it closes`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > an operation already done is left alone`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > attempts only another device made mean it is claiming: nothing is written`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > a quote ISSUED that this device never minted: nothing is written, never failed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > every attempt is on record > this device's lost claim is reclaimed though another device's attempt came after it`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > every attempt is on record > another device's lost claim is reclaimed by this device's own claim`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a lost response is reclaimed from this device's own counter`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a quote unpaid past its expiry is closed failed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a device clock ahead of the mint's never closes a quote the customer can still pay (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > two devices reserving one block each keep an attempt of their own (cashu/0029) > one device's refused call never hides the outputs the other device's call got signed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > collisions with slots another device used are recovered, the mint answering in the current code set (cashu/0037)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a new device restores the keyset before its first claim and starts past what is signed`
- `packages/core/src/modules/cashu/cashu-counter-actions.test.ts > cashu counters > a collision with slots another device used jumps past the last signed one`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > every attempt is on record > this device's lost swap is reclaimed though another device's attempt came after it`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > another device received it: done, nothing written`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > another device got there first > a receive another device has pending: nothing is written, never failed`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a failure before the swap leaves no pending receive, and a retry receives it`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a pending receive no device reserved a counter for is taken over`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a token another wallet already spent is received elsewhere, writing no operation`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > an operation whose block's first slot is unsigned contests nothing in it (cashu/0029) > a spent token's receive leaves the outputs another operation signed in its block to that operation`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a call that signs its first slot right after it was read keeps its block`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a topup whose quote is paid, its mint call perhaps in flight, contests the block`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a receive whose outputs another operation's contest gave to no one reads contested (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a token another wallet already spent is received elsewhere, writing no operation`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a contested block is shown on the payment, and the message is settled (cashu/0029)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a block's claim ends on the mint's word (cashu/0029) > a topup whose outputs a contest gave to no one is closed contested, unbooked, and polled no more (cashu/0029)`
- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > a Lightning payment a contest gave to no one is shown on its payment (cashu/0029) > a quote the payment holds whose topup carries the contest's mark is found; one without it is not`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > another device got there first > attempts only another device made mean it is claiming: nothing is written`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a block's claim ends on the mint's word (cashu/0029) > a contest is ambiguous within the grace, and past it stored unbooked and refused for both`
