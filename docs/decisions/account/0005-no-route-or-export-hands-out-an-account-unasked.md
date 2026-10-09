# 0005 No route or export hands out or removes an account it was not asked to

Status: accepted
Date: 2026-10-08

## Context

Access control (access/0001) gates the `_terminal` routes, but several
ways around them existed, open to anyone at the device with or without
access control:

- `/recovery` sat outside `_terminal`, showed the recovery phrase,
  switched accounts and exported the device database to anyone typing the
  URL.
- The device database export, also offered in Settings → Evolu export,
  holds every account's master key, whichever account is active.
- `/restore-account?source=onboarding&previous=<id>` removed that account
  from the device, and `?created=true` then Cancel removed the active one:
  the URL decided which account to remove or select.
- `/onboarding` rendered for an onboarded account, showing its recovery
  phrase and offering to remove it; finishing it would overwrite the bank
  account singleton before any check.

## Decision

- `/recovery` and the device database export are removed. The Evolu export
  offers the active account's app database only, which holds that
  account's data but not its master key.
- `/restore-account` keeps only `source` in the URL. What the restore did
  (`previous`, `created`) lives in a memory-only atom set by the restore or
  transfer that just ran; with it empty — a typed URL, a reload — the page
  removes and selects nothing.
- `/onboarding` has a `beforeLoad` that redirects an onboarded account to
  `/`. `finishOnboarding` refuses an onboarded account before its first
  write, and `completeOnboarding` keeps the same check as the last line of
  defence.
- Switching account and removing another account need the active account's
  `admin` (access/0002); the other account's PIN is not asked. The removal
  confirmation warns that without the recovery phrase the account is lost.

## Alternatives considered

Gating `/recovery` instead of removing it: it existed for a broken app
database, which is exactly when the access-control data cannot be read.

## Consequences

- When the active account's app database will not open, the device can no
  longer switch away from it; "Try again" and "Repair" stay.
- An account without access control can remove a locked one from the
  device. Accepted: a device belongs to one owner, and the account comes
  back from its phrase.

## Enforced by

- `src/features/account/restored-account.test.ts > planRestoreCleanup > an empty atom removes and selects no account from %s`
- `src/core/modules/app-settings/app-settings-actions.test.ts > finishOnboarding > writes no row on an onboarded account`
- `e2e/access-gates.spec.ts > a typed URL neither removes an account nor reopens onboarding`
