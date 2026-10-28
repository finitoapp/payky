# 0016 The mints screen manages trust and the default

Status: accepted
Date: 2026-10-28

## Context

`cashu/0010` managed mints as Linky does: the default mint was Linky's
setting, removing had to respect Linky's `deferredReceive`, and the screen
warned that Linky's Lightning address kept paying the old mint. With a
wallet of Payky's own (cashu/0012), trusted mints (cashu/0017) and the
default among them (cashu/0013), none of Linky's parts applies and the
screen manages trust instead.

## Decision

- The mints screen has three sections, each hidden when empty: the trusted
  mints, the default first with its badge; other mints with a balance, which
  are not trusted; and the preset mints not in either as suggestions. A mint
  named only by spent proofs or finished operations is not listed.
- Adding a mint, or "Trust" on its detail page, checks that its info and
  keysets load and that it lists no other mint's keyset; the mint becomes
  trusted, and the default does not change.
- A suggestion opens the mint's detail, where "Trust" is one more tap;
  nothing is trusted from the list.
- Untrusting is allowed with a balance: the proofs stay and the mint moves to
  the other mints, from where its money is moved or withdrawn. Untrusting the
  default is allowed while another mint is trusted, and the screen names the
  mint that takes over; the last trusted mint cannot be untrusted.
- "Use for payments" is offered only on a trusted mint.
- Moving funds is a quote at the default, a melt at the source paying it, a
  claim at the target, linked by a `cashuMove` row. It runs only on the
  merchant's action, asks for the PIN, and the Cashu job claims an
  interrupted move's topup. Neither leg is income (cashu/0014).
- There is no npub.cash suggestion and no warning about Linky.

## Alternatives considered

- Refusing an untrust while the mint holds money: the moment a mint looks
  unsafe is when the merchant wants to stop accepting it before moving the
  money out.
- Listing every mint a proof or an operation ever named: being listed would
  say nothing about trust, and a mint once used would never leave the list.
- A device-local "seen" list of mints: a mint the merchant added on one
  device would be missing on the next.

## Consequences

The trusted section is never empty: the default, with `MAIN_MINT_URL` as the
last fallback, is always in it.

## Enforced by

- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > trusts a mint that loads, without changing the default`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > refuses a mint that does not load`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > untrusting a mint with a balance keeps the balance`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > untrusting the default hands it to the previous choice, which it returns`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > the last trusted mint cannot be untrusted`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > trusting a mint again keeps the default where it is`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > trusting the last choice again after untrusting it keeps the default where it is`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > Cashu ids and spellings > a typed mint URL gets https and needs a dot in its host`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > moves an amount: a melt at the source, a topup at the target, linked by the move`
- `apps/native-app/src/features/settings/payment-accounts/cashu-mints-page-model.test.ts > lists the trusted mints in their order and leaves them out of the suggestions`
- `apps/native-app/src/features/settings/payment-accounts/cashu-mints-page-model.test.ts > puts a mint not trusted that holds a balance apart, not among the suggestions`
- `apps/web-app/e2e/cashu.spec.ts > the mints screen lists the default mint with its balance`
- `apps/web-app/e2e/cashu.spec.ts > trust a suggested mint, take a payment there, then stop trusting it with its balance`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > estimates a move without touching a proof`
- `packages/core/src/modules/cashu/cashu-move-actions.test.ts > moving funds between mints > a sweep moves everything the fees leave`
