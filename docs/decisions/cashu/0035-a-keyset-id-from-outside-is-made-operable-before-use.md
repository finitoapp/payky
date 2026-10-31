# 0035 A keyset id from outside the wallet is made operable before use; only the mint's answer makes it unknown

Status: accepted
Date: 2026-10-29

## Context

Payky keeps one cashu-ts wallet per mint for as long as the app runs
(`CashuWalletDep.load`). The wallet holds a snapshot of the mint's
keysets from when it loaded. Mints rotate keysets, after a fee change for
instance.

When a mint rotated under a loaded wallet, a token the customer minted in
the new keyset did not decode against the old snapshot. It was taken for
`TokenUndecodable`, final for the run: the payment stayed unpaid and the
wait screen called a valid token unreadable, until the app was restarted.
Restoring another device's attempt made in the new keyset failed the
same way, so its outputs were not reclaimed. Outputs of the wallet's own
in a keyset the mint retired were already handled. cashu-ts answers the
mint's 12002 with `StaleKeysetError`, refreshes its snapshot, and the
call is tried again (`cashu/0030`).

cashu-ts keeps the snapshot right itself. It refreshes in place, shared
by concurrent operations and rate limited, and offers
`ensureOperableKeysets(ids)` for ids that come from outside the wallet.
It answers `UnknownKeysetError` with `refreshed: true` once the mint has
been asked and does not know the id, or `refreshed: false` when it got
no answer. A keyset id comes from outside the wallet in two places: a
token sent to Payky, and the attempts other devices put on record.

## Decision

- One wallet per mint stays. Its snapshot of the mint's keysets is
  refreshed only by cashu-ts, in place: no second instance is built.
- The keysets of attempts on record are made operable
  (`ensureOperableKeysets`) before they are restored, in a reclaim and in
  a keyset scan.
- The keysets of the wallet's own stored proofs are made operable before
  their input fee is priced, in a melt's quote, its selection and a move's
  sweep: a proof another device stored may be in a keyset this wallet has
  not loaded.
- A token the wallet cannot decode refreshes the snapshot once
  (`loadMint(true)`) and is decoded again. Only then is it
  `TokenUndecodable`. A token's own keyset ids cannot be read before it
  is decoded.
- `UnknownKeysetError` with `refreshed: true` is the mint's word:
  `MintRejected`. With `refreshed: false` the outcome is unknown:
  `MintUnreachable`, tried again.

## Alternatives considered

- Replacing the cached wallet with a freshly loaded one on a sign of a
  stale snapshot: two instances of one mint, operations in flight on the
  old one, and a reload per sign that bypasses cashu-ts's shared,
  rate-limited refresh.
- Refreshing the keysets before every operation: a request per operation
  for a change that happens rarely.
- A time-based refresh of the cache: a guess at how often mints rotate,
  wrong in both directions.

## Consequences

A token that is not a valid token for its mint costs one refresh of the
mint's keysets before it is refused. A mint that keeps rotating is asked
again each time a token or an attempt names a keyset the wallet has not
seen.

## Enforced by

- `packages/core/src/background-jobs/jobs/cashu-token-listener.test.ts > the token listener > a mint that rotated its keyset under a loaded wallet: the token is received without a restart (cashu/0035)`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a keyset id from outside is made operable before use (cashu/0035) > a token naming a keyset the mint does not list stays undecodable, asking the mint once`
- `packages/core/src/modules/cashu/cashu-receive-actions.test.ts > receiveCashuToken > a keyset id from outside is made operable before use (cashu/0035) > another device's lost swap in a keyset this wallet has not loaded is reclaimed`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a mint that rotated its keyset > another device's lost claim in a keyset this wallet has not loaded is reclaimed (cashu/0035)`
- `packages/core/src/modules/cashu/cashu-topup-actions.test.ts > claimCashuTopup > a mint that rotated its keyset > a wallet loaded before the rotation claims in the new keyset on its next try, with no restart (cashu/0035)`
- `packages/core/src/modules/cashu/cashu-melt-actions.test.ts > meltCashu > what a melt costs (cashu/0023) > a proof synced in at a keyset this wallet has not loaded is priced, not thrown on (cashu/0035)`
