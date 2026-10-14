# 0009 Cashu screens and actions are admin, moving funds asks for the PIN

Status: accepted
Date: 2026-10-14

## Context

Cashu adds a payment account with its own screens: the account detail, the
mints list, a mint's detail, adding a mint, and actions that set the default
mint, remove a mint and move funds between mints (`cashu.md` §7–8). The
permission map (access/0008) puts payment accounts and withdraw under
`admin`.

## Decision

- Every Cashu route under `_terminal` declares `admin`, like the other
  payment accounts, and so do setting the default mint, adding and removing
  a mint.
- Moving funds between mints and withdrawing ask for the PIN every time, as
  every withdrawal does (access/0007): both send money out of a mint.
- No new permission.

## Alternatives considered

A permission of its own for the mints: nothing a merchant delegates sits
there.

## Consequences

A device without `admin` sees the Cashu tab on the payment screen, which is
`sell`, but none of its settings.

## Enforced by

- `src/router.test.ts > _terminal route access (access/0003) > every route declares a permission or free, layouts included`
