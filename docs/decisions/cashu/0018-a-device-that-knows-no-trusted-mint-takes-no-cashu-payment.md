# 0018 A device that knows no trusted mint takes no Cashu payment

Status: accepted
Date: 2026-10-28

## Context

The Linky wallet's preparation waited until its shard owners had hydrated
and failed with `CashuWalletNotSynced` when they did not in time. With the
wallet in the app database (cashu/0012) that wait went, and nothing took its
place: a device whose sync had delivered the Cashu account but not its
mints read the default as `MAIN_MINT_URL` (cashu/0013) and quoted
the payment there. On a freshly restored device the customer's sats then
went to `MAIN_MINT_URL` even when the merchant had untrusted it, and the
fallback the payment wrote (`isAutoDefault`, which leaves `isDeleted` alone)
kept every later payment on that device quoting there until the mints
arrived (finding 4 of the PR #172 review).

A synced account always has a trusted mint: enabling Cashu seeds one in the
batch that enables the account, and the last trusted mint cannot be
untrusted (cashu/0015). Evolu offers no signal that a given row has synced.

## Decision

- Preparing a Cashu payment on a device that knows no trusted mint, neither
  the merchant's list nor the seed (`cashu/0013`), fails with
  `CashuMintsNotSynced` before anything is quoted or written.
- The payment wait screen shows its usual preparation error with a retry;
  once the mints sync in, the retry quotes at the default.
- Such a device has no default and trusts no mint, `MAIN_MINT_URL`
  included: the trusted mints are an empty list, never `MAIN_MINT_URL` in
  their place.
- Its mints screen says the mints have not synced to this device yet in
  place of the trusted section, and the Cashu settings say it in place of
  the default mint. Trusting a mint, choosing one for payments and
  untrusting one fail with `CashuMintsNotSynced` and write nothing: any of
  them writes the whole list, which would replace the merchant's list
  before it arrived.
- With a trusted mint known, the default is that of `cashu/0013`.

## Alternatives considered

- Quoting at `MAIN_MINT_URL` as before: money lands at a mint the merchant
  may have untrusted.
- Waiting on the relays' sync state before quoting at all: it says whether
  a relay finished, not whether the mints were among what it sent. It does
  say when no list is on its way, which is when the seed is written
  (`cashu/0013`).
- Showing `MAIN_MINT_URL` as the trusted default while no row is known:
  choosing it on that device trusted it again and made it the default on
  every device, over an untrust whose tombstone had not synced in.
- Leaving trusting open until the list arrives: the list it wrote would
  replace the merchant's. No merge leaves an account with no trusted mint
  (`cashu/0013`), so trusting is not needed to recover from one.

## Consequences

- A device on which the merchant enabled Cashu before it synced takes Cashu
  payments once it has synced and the seed or the list is here
  (`cashu/0013`).

## Enforced by

- `packages/core/src/modules/payment/payment-cashu-preparation.test.ts > prepareCashuPaymentMethod > a device that knows no trusted mint (cashu/0018) > quotes nothing before the account's mints sync in`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a device that knows no trusted mint (cashu/0018) > chooses no mint for payments, MAIN_MINT_URL included, and writes nothing`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a device that knows no trusted mint (cashu/0018) > untrusts nothing, and writes nothing`
- `packages/core/src/modules/cashu/cashu-mint-actions.test.ts > a device that knows no trusted mint (cashu/0018) > trusts no mint either, and writes nothing: its list would replace the merchant's (cashu/0013)`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the trusted mints (cashu/0013) > with no row, or neither cell, no mint is trusted and there is no default, MAIN_MINT_URL included (cashu/0018)`
- `packages/core/src/modules/cashu/cashu-utils.test.ts > the order of the trusted mints (cashu/0016) > with no trusted mint the request names none, MAIN_MINT_URL included (cashu/0018)`
- `apps/native-app/src/features/settings/payment-accounts/cashu-mints-page-model.test.ts > a device that knows no trusted mint lists none as trusted, MAIN_MINT_URL among the suggestions (cashu/0018)`
