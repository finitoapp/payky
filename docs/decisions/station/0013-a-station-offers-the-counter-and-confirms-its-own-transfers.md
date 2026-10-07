# 0013 A station offers only the keypad, its own history and its device settings, and confirms its own bank transfers

Status: accepted
Date: 2026-10-07

## Context

Supersedes station/0011, which also kept a station from marking a bank
transfer received. A station is a shared device at a counter: anyone
standing there can tap it. Its account is built from the owner's config
(station/0008), so it holds the owner's IBAN, currency and employee list,
but none of the owner's catalog, bills, accounts, EET or wallet. A bank
transfer confirmed at the station now settles on the owner (station/0012).

## Decision

A station shows the keypad, the tip page and the payment it starts, its own
payment history and payment detail, and a settings page of its own: who is
selling, delivery to the owner, language, theme, about, and leaving PoS
mode. Every other route sends it home, and onboarding, recovery and account
restore are closed to it. The employee is picked from the home header with
one tap. The payment screen's bank tab offers the same "mark as paid" the
owner has.

## Alternatives considered

Hiding only the navigation to owner screens: a typed URL or a stale link
would still open them. Leaving bank confirmation to the owner
(station/0011): counter sales stayed pending until the owner was online.

## Consequences

Anything the counter needs later has to be added to the station's allowlist
on purpose. Whoever stands at the station can mark a bank payment paid, so
the owner relies on staff checking the transfer, as with cash. Leaving PoS
mode is open to anyone at the station, so the login page warns when the
device holds other accounts.

## Enforced by

- `src/features/station/station-route-access.test.ts > isRouteAllowedForStation > lets a station open %s`
- `src/features/station/station-route-access.test.ts > isRouteAllowedForStation > keeps a station out of the owner's %s`
