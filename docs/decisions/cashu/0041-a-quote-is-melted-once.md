# 0041 A quote is melted once, whichever device settles it

Status: accepted
Date: 2026-10-31

## Context

A melt's operation id derives from its mint and quote, and so does its
withdrawal's account transaction. `meltCashu` checked only that the mint
reported the quote UNPAID. A quote whose first melt was left pending with
its request lost before the mint, or closed `unpaid` by another device's
fence (`cashu/0027`), is still UNPAID, so calling `meltCashu` again ran the
whole melt once more under the same operation: it held more proofs,
reserved new slots, overwrote the melt's `inputsTotal`, and sent a second
request. Settled paid, every proof held under the operation was marked
spent, those of the request the mint never took too, so the balance read
less than the mint holds. `cashu/0027` already says resuming a melt never
sends it again.

`executeCashuWithdrawal` wrote a withdrawal under a fresh id on each call.
Confirming the same quote twice left a second withdrawal that no settlement
closes, shown in progress for good.

## Decision

- A melt already written for a quote is never sent again. `meltCashu`
  checks for it under the counter lock, before anything is selected or
  written, so a second call on the same device waits for the first one's
  rows: pending, it is left to the resume (`CashuMeltPending`); closed
  unpaid or failed, it stays closed (`CashuMeltUnpaid`).
- The withdrawal of a Cashu melt has an id derived from the melt
  (`deriveCashuWithdrawalId`), one per quote. Executing a quote whose melt
  was written leaves the withdrawal as its settlement wrote it; executing
  one whose melt was never written, refused before anything moved, retries
  it in the same row.
- Across devices nothing more is needed. A melt quote exists on the device
  that requested it, until it executes it; another device reaches the melt
  only through its resume, which never sends (`cashu/0027`). Two devices
  paying one invoice hold two quotes and two melts: the mint refuses to pay
  an invoice paid or being paid, an answer that leaves the second melt to
  its quote's state (`cashu/0027`), and Lightning settles a payment hash
  once.

## Alternatives considered

- Checking for the melt before taking the lock: two calls on one device
  could both pass it.
- Letting a second call resume the melt in place: the resume takes the lock
  of the melt's keyset, which may not be the one the call holds; the Cashu
  job resumes it on its next pass.

## Consequences

A merchant who confirms a quote whose melt failed after it was written is
shown that withdrawal, and quotes again for a new one.

## Enforced by

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a quote is melted once, whichever device settles it (cashu/0041) > a quote whose melt is pending is not sent again: the second call leaves it to the resume`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a quote is melted once, whichever device settles it (cashu/0041) > a melt another device took over and closed unpaid, its quote still payable, is not sent again by its sender`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a quote is melted once, whichever device settles it (cashu/0041) > two calls at once on one device send one melt`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > executing a quote again leaves one withdrawal, its melt sent once (cashu/0041)`
- `packages/core/src/modules/withdraw/withdraw-cashu-actions.test.ts > Cashu withdrawals > a withdrawal refused before anything moved is retried in the same row (cashu/0041)`
