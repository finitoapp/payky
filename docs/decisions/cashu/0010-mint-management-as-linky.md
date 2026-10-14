# 0010 Mints are managed as Linky manages them, with three deliberate differences

Status: accepted
Date: 2026-10-14

## Context

The wallet is Linky's, so its mints are too (`cashu.md` §7, decision 5b).
Linky lists known mints, adds one by URL, sets the default, moves funds
between mints and removes an unused one.

## Decision

- The mints screen lists the known mints (named by proofs or operations, or
  seen or added on this device) with their balance and the default badge,
  then Linky's preset mints as suggestions; looking at a suggestion records
  nothing.
- Set as default writes Linky's synced `defaultMint`, skipping an unchanged
  value, and moves no funds. The screen says that Linky's Lightning address
  keeps paying into the old mint until the default changes in Linky.
- Move funds is Linky's autoswap: a quote at the target, a melt at the
  source, a claim at the target, an `autoswap` and a `melt` operation. It
  runs only on the merchant's action, asks for the PIN, and the Cashu job
  resumes an interrupted one.
- Removing drops the mint from this device only, refused while a proof that
  is not spent or a pending `deferredReceive` names it.
- Where Payky differs from Linky: adding a mint checks that it loads and
  lists no other mint's keyset; adding does not make it the default; and
  there is no npub.cash suggestion nor a test-mint switch.

## Alternatives considered

Linky's add, which makes the new mint the default at once: a mistyped mint
would take every following payment.

## Consequences

A test mint can still be added by URL.

## Enforced by

- `src/core/cashu/cashu-mints.test.ts > managing mints > a typed URL gets https and needs a dot in its host`
- `src/core/cashu/cashu-mints.test.ts > managing mints > adds a mint that loads, without making it the default`
- `src/core/cashu/cashu-mints.test.ts > managing mints > refuses a mint that does not load`
- `src/core/cashu/cashu-mints.test.ts > managing mints > removes a mint only while nothing in the wallet names it`
- `src/core/cashu/cashu-mints.test.ts > the default mint > is seeded once when Cashu is enabled, never over a mint Linky chose`
- `src/core/cashu/cashu-autoswap.test.ts > moving funds between mints > estimates a move without touching a proof`
- `src/core/cashu/cashu-autoswap.test.ts > moving funds between mints > moves an amount: a melt at the source, a mint at the target`
- `src/core/cashu/cashu-autoswap.test.ts > moving funds between mints > a sweep moves everything the fees leave`
- `e2e/cashu.spec.ts > the mints screen lists the default mint with its balance`
