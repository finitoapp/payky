# 0011 A station offers only the keypad, its own history and its device settings

Status: accepted
Date: 2026-10-07

## Context

A station is a shared device at a counter: anyone standing there can tap it.
Its account is built from the owner's config (station/0008), so it holds the
owner's IBAN, currency and employee list, but none of the owner's catalog,
bills, accounts, EET or wallet. Settlement truth for bank transfers stays
with the owner (station/0006), who sees the bank account and the station
does not.

## Decision

A station shows the keypad, the tip page and the payment it starts, its own
payment history and payment detail, and a settings page of its own: who is
selling, delivery to the owner, language, theme, about, and leaving PoS
mode. Every other route sends it home, and onboarding, recovery and account
restore are closed to it. The employee is picked from the home header with
one tap. A station cannot mark a bank transfer received; its payment screen
says the owner confirms it.

## Alternatives considered

Hiding only the navigation to owner screens: a typed URL or a stale link
would still open them. Letting the station confirm a transfer by hand: the
person at the counter cannot see the bank account, and the owner's FIO sync
or the owner settles it anyway.

## Consequences

Anything the counter needs later has to be added to the station's allowlist
on purpose. A customer's bank transfer stays pending on the station until
the owner's `settled` message arrives, which needs the owner online. Leaving
PoS mode is open to anyone at the station, so the login page warns when the
device holds other accounts.

## Enforced by

- `src/features/station/station-route-access.test.ts > isRouteAllowedForStation > lets a station open %s`
- `src/features/station/station-route-access.test.ts > isRouteAllowedForStation > keeps a station out of the owner's %s`
