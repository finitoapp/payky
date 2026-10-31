# 0032 A move is done once its melt is paid; a quote issued meanwhile is read again, not taken for a refusal

Status: accepted
Date: 2026-10-29

## Context

A move (`cashu/0015`) has three steps: a quote at the target, a melt at
the source paying its invoice, and a claim at the target. The merchant's
action ran all three and reported the move by the claim's result.

Every device's Cashu job polls every pending topup, a move's included,
every 5 s. Once the source pays, another device's job often reads the
target quote `PAID` and mints it before the moving device's own claim
gets there. That claim had checked the quote too, read `PAID`, and then
called the mint, which answered 20002, "quote already issued". The claim
took that for a refusal and failed `MintRejected`. The move reported
failure though the funds had moved, and the merchant, retrying, paid the
Lightning and input fees a second time.

Two things were wrong. 20002 is the mint's word on the quote's state,
the same thing the claim had just asked about, not a refusal of the
claim. And once the melt is paid the target's invoice is paid: the money
belongs to the account whoever mints it and whenever. `cashu/0021`
already leaves a move's topup to the job whenever the moving device does
not finish it.

## Decision

- A claim that the mint answers 20002 marks its own fresh attempt refused
  (`cashu/0029`, ground 1) and goes on to its next round, which reads the
  quote again. An `ISSUED` quote is then reclaimed from the attempts on
  record, or is another device's (`claimedElsewhere`).
- A move is done once its melt is paid. The moving device then claims the
  target only to save the job a poll. A claim that fails, or that finds
  the quote another device's, leaves the move done and the topup pending
  for the job (`cashu/0021`). The move reports the amount minted when its
  own claim minted it, else the amount the merchant confirmed.

## Alternatives considered

- Retrying the move's claim until it settles: the merchant waits on a
  mint, or on another device's sync, for money that has already moved.
- Leaving 20002 a refusal and reading the quote only in the job: every
  claim that loses that race reports an error for something that went
  right.

## Consequences

A move can be reported done while the target's proofs are still on
another device, or still to be minted by the job: the target's balance
on this device catches up when they sync in or when the job claims. A
move whose melt was paid but whose target mint is down shows done and
fills in later.

## Enforced by

- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > a move is done once its melt is paid (cashu/0032) > another device minting the target first leaves the move done, its topup to be reclaimed`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > a move is done once its melt is paid (cashu/0032) > a target the claim cannot reach leaves the move done, and the job claims it`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a quote issued between the check and the call is read again, not taken for a refusal (cashu/0032)`
