# 0037 A mint's answer is read through one table that knows both NUT-00 code sets

Status: accepted
Date: 2026-10-30

## Context

How Payky's wallet reacts to a refused call depends on what the mint said.
Outputs signed before, outputs pending, or duplicate outputs are a collision
of NUT-13 slots: the counter moves past them and the call is made again
(`cashu/0029`, `cashu/0031`). Spent proofs, pending proofs, and an issued
quote each have a path of their own. Any other coded answer is a refusal:
the call's block is refused and the operation fails.

NUT-00 renumbered its codes in January 2026, and Nutshell followed in
September 2026. Until then an output signed before was 10002, 11002 an
unbalanced transaction, 11003 a secret too long, 11004 no secret in the
proofs, and 11005 an unsupported unit (Nutshell 0.16.5 and 0.17.0). Since
then 11002 means pending proofs, 11003 outputs signed, 11004 outputs
pending, 11005 an unbalanced transaction, and 11013 an unsupported unit.
CDK uses the new set; its older releases sent pending proofs as 11012.
Mints of both generations are in use (`cashu/0033`).

Five predicates in three files each read the codes their own way. They knew
11003 but not 10002, and took 11005 for outputs signed before. A mint
answering a slot collision with 10002 and wording no text match knew, such
as CDK's older "Blinded Message is already signed", had that collision
taken for a final refusal. A token was then reported failed, its QR shown
again, and the customer asked to pay twice. A topup claim failed the same
way on every poll. An unbalanced transaction under the new set was retried
as a collision.

## Decision

- One module, `packages/core/src/cashu/cashu-mint-errors.ts`, reads a mint's
  error answer into what it means: outputs signed, outputs pending,
  duplicate outputs, proofs spent, proofs pending, quote issued, melt quote
  pending, melt quote paid, stale keyset, or another refusal. Nothing else
  in the wallet compares error codes.
- A code that means the same in both sets decides alone: 10002 outputs
  signed, 11001 proofs spent, 11008 duplicate outputs, 20002 quote issued,
  20005 quote pending, 20006 invoice already paid.
- Proofs pending, a melt quote pending and a melt quote paid say a melt may
  be paying (`isMeltUnderWay`): coded as they are, they are no refusal of a
  melt request (`cashu/0027`).
- A code whose meaning moved between the sets, 11002 to 11005, decides
  nothing by itself. The answer's wording decides, as it does for an answer
  with no code. Without wording that says more, a coded answer is a
  refusal. "Pending" counts as pending proofs only with the inputs as its
  subject ("proofs are pending", "Token Pending"), so a sentence that
  mentions pending proofs about something else, such as a melt quote,
  stays a refusal.
- What counts as a refusal (`cashu/0029`) is unchanged: an answer with a
  code, or cashu-ts's stale keyset.
- The fake mint answers in either set, so tests cover both.

## Alternatives considered

- Adding 10002 to the existing predicate: it fixes one code, leaves 11005
  misread and the codes read in five places.
- Asking the mint which set it speaks: no NUT tells, and a version string
  would need a table of its own per implementation.

## Consequences

A new mint implementation whose wording no rule knows, answering a moved
code, is taken for a refusal. That is the safe side: the call signed
nothing, so its block is refused and the operation is tried again from a
fresh block or reported failed.

## Enforced by

- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > outputs signed before are a collision under 11003 and the legacy 10002`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > 11005 is a refusal, not a collision, in either code set`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > 11002 is proofs pending only when its wording says so`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > 11003 and 11004 decide by their wording: outputs in the current set, a secret in the legacy one`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > pending reads as proofs pending only when the inputs are its subject`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a mint's answer is read in both NUT-00 code sets (cashu/0037) > an answer with no code is the mint's word only by its wording, and no refusal`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > collisions with slots another device used are recovered, the mint answering in the legacy code set (cashu/0037)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > collisions with slots another device used are recovered, the mint answering in the current code set (cashu/0037)`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a melt refusal that says the melt may be paying is no final refusal (cashu/0037) > a pending quote, a paid invoice and pending inputs say the melt may be paying`
- `packages/core/src/cashu/cashu-mint-errors.test.ts > a melt refusal that says the melt may be paying is no final refusal (cashu/0037) > any other refusal still says nothing was paid`
