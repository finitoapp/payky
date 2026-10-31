# 0040 A melt and a newly trusted mint stand on keysets read from the mint, not on an earlier session's

Status: accepted
Date: 2026-10-31

## Context

A mint's info and keysets are kept on the device (`_cashuMintCache`), so a
later session's wallet loads without asking the mint and refreshes from it
behind (`docs/cashu.md` §3). Until that refresh lands, or when it fails,
the wallet stands on the earlier session's snapshot, bound to the keyset
the mint signed with then (`cashu/0035`).

Most calls recover from such a snapshot: a topup's claim or a token's swap
refused with 12002 is tried again on the next pass, in the keyset cashu-ts
rebinds to (`cashu/0030`). A melt does not. Its pre-swap refused with 12002
closes the melt `failed` and fails its withdrawal, and its operation id
derives from the quote, so it cannot be sent again: the merchant starts
over although a pre-swap in the new keyset would have paid.

Trusting a mint checks that its info and keysets load and that it lists no
other mint's keyset (`cashu/0015`). A snapshot an earlier session kept
passes that check for a mint that is down now, or one that has since
started listing a keyset another trusted mint owns.

## Decision

- `loadCashuWallet` takes how recent the snapshot must be. Any snapshot
  serves by default, a cached one included.
- A melt loads its wallet with a snapshot this session read from the mint
  (`loadCurrent`): a wallet loaded from the cache waits for its refresh,
  and one whose refresh failed asks the mint once more. A mint that does
  not answer then is `MintUnreachable`, before anything is written.
- Trusting a mint asks the mint for its info and keysets at that moment
  (`refresh`), and checks those.
- A refresh, whichever call asks for it, keeps what it read for a later
  session, a token's refresh (`cashu/0035`) included. A cache write that
  fails changes no outcome.

## Alternatives considered

- Refreshing before every operation: a request per operation for a change
  that happens rarely (`cashu/0035`). A session refreshes a cached mint once,
  and a melt waits only for that one.
- Trying a melt again in the new keyset after 12002: its intent, holds and
  pre-swap attempt are written under the old keyset's lock, and a settled
  melt stays settled (`cashu/0022`).
- No cache: a mint that is slow or down at start would hold up every screen
  that only shows it.

## Consequences

A melt in a session that has not reached the mint yet costs one refresh of
the mint's keysets before its pre-swap. A mint that rotates between that
refresh and the pre-swap still fails the melt; it is rare, and the merchant
sees the withdrawal failed, its money back.

## Enforced by

- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > a melt derives its outputs in the keyset the mint signs with now (cashu/0040) > a wallet loaded from an earlier session's snapshot, its refresh failed, refreshes before the pre-swap`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > trusting mints > refuses a mint that loaded before and does not load now, never trusting a kept snapshot`
- `packages/core/src/cashu/cashu-mint-cache.test.ts > createCashuMintCache > a wallet that must be current waits for the refresh behind the cache, asking again after one failed`
- `packages/core/src/cashu/cashu-mint-cache.test.ts > createCashuMintCache > a refresh asked for keeps the mint's new keysets for a later session`
- `packages/core/src/cashu/cashu-mint-cache.test.ts > createCashuMintCache > a cache that cannot be written, its database closed, fails no load nor refresh`
