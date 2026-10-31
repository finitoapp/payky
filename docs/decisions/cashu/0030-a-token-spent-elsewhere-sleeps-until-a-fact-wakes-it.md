# 0030 The NIP-17 message is Payky's only token queue; a token spent elsewhere sleeps until a fact about its receive wakes it

Status: accepted
Date: 2026-10-29

## Context

A token can be found spent with no attempt on record holding its outputs.
The obvious answer is final for the run: say another wallet received it,
show the QR again, and leave the message alone until the app starts
again.

That conclusion rests on something missing, not on something known. Every
Payky device of an account reads the same NIP-17 inbox, so two devices
working on one message is the usual case at a till with several
devices. When device B swaps the token and loses the answer, device A,
which has not seen B's attempt yet, finds the token spent and no attempt
holding its outputs. In a database that merges devices' writes whenever
they sync, a row that has not arrived proves nothing. A sent the customer
back to the QR, inviting a second payment, and never took over B's
attempt (`cashu/0017`) within the run. A wait before concluding would only
narrow this: a device offline for longer than the wait breaks it again,
and the QR would stay hidden for that long even when Linky did spend the
token.

What could change the conclusion is known. The mint's word is final: the
token stays spent. Only two facts, both arriving by sync, can overturn
it: another device's attempt for the receive, or the receive's
settlement. `cashu/0029` already decides only on facts that only ever
grow, and wakes on them.

## Decision

- When the mint cannot be loaded or does not answer before the swap,
  Payky writes nothing and leaves the token in its NIP-17 message.
- The listener runs whenever the Cashu account is enabled. On every tick
  it tries each token message in its look-back window (7 days, never less
  than NIP-59's two) whose receive has no `settledAt`, except one asleep.
  While the account is disabled it works on no message; enabling it again
  loads the window anew.
- A receive is never written `failed` (`cashu/0029`). The mint's coded
  refusal is remembered for the run and shown on the payment's arrival,
  so a token the mint still refuses is asked about once a run. An answer
  without a NUT-00 code (a body that would not parse, a proxy's 4xx, a
  failure after a signed answer) leaves the call's outcome unknown, as a
  lost answer does, and is tried again.
- "Inputs pending" is tried again after the retry interval, as an
  unreachable mint is.
- A token spent with no attempt on record holding its outputs is not
  concluded for good. For the grace (`CLAIMED_ELSEWHERE_GRACE_MS`) from
  when the listener first found it so, the arrival says it is being
  checked, `checkingElsewhere`, and the QR stays hidden. Past the grace
  the mint is asked once more, and the arrival says another wallet
  received it, `receivedElsewhere`, with the QR shown.
- From then on the message sleeps. No tick works on it and no mint is
  asked. The listener watches the receive's attempts and its row, and
  wakes the message when either differs from what that pass saw. A woken
  message goes the usual way: another device's attempt is waited for and
  taken over (`cashu/0017`), a settled receive pays its payment
  (`cashu/0025`).
- Payky writes no `deferredReceive` of its own.

## Alternatives considered

- Final for the run: an attempt that syncs in
  later is never taken over until the app starts again, and the customer
  is shown the QR meanwhile.
- A wait before concluding, then final: narrows the window by a guess at
  how long sync takes, which a device offline for longer breaks.
- Trying a token spent elsewhere on every tick: a mint round trip every
  30 s for a token that only a sync can change.
- Deriving a receive's first block from its token, so a device could find
  another's outputs without its attempt: a NUT-09 restore from the seed
  alone walks contiguous slots with a gap limit and would miss them; the
  blocks scatter across the counter; and no retry past a collision is
  covered.

## Consequences

A message leaves the window, or a relay drops it, and nothing works on it
any more: an attempt that syncs in after that is reclaimed only by
another operation's reclaim that shares its block. The wait screen says a
token spent by Linky is being checked for the grace before it shows the
QR again. A token spent elsewhere costs one mint answer at the start and
one past the grace, and none after, until a fact wakes it or the app
starts again.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token spent elsewhere is concluded on facts, and woken by one (cashu/0030) > a token spent elsewhere sleeps once said so: no pass asks the mint until a fact arrives`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token spent elsewhere is concluded on facts, and woken by one (cashu/0030) > another device's attempt arriving after the token was said spent elsewhere wakes it, and its swap is reclaimed`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a token Linky on the same npub received first leaves the payment unpaid and says so (cashu/0029)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a mint refusal writes no failed and is asked once a run (cashu/0030)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > inputs pending is tried again on the next pass (cashu/0030)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a swap whose answer could not be read is tried again, and its outputs received without a restart (cashu/0030)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > an unreachable mint writes nothing`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > while stopped, the Cashu account disabled, a loaded message is not worked on; started again, it is received (cashu/0030)`
- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a tick that was running when the listener stopped leaves no state behind: started again, the message is worked on at once (cashu/0030)`
