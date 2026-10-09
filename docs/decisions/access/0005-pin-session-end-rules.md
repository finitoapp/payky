# 0005 When a PIN session starts and ends

Status: accepted
Date: 2026-10-08

## Context

Entering the PIN on every screen would make the owner's own work painful;
a session that never ends hands the owner's rights to whoever picks the
device up next.

## Decision

- A session starts when the PIN, or the recovery phrase, is entered on a
  locked route. It lives in memory only (a Jotai atom), tied to the account
  it was entered for.
- It ends on: navigating to a route the device defaults already cover;
  five minutes without activity, on any route, `free` ones included; the
  app going to the background; switching account.
- A `free` route neither starts nor ends a session, so going back to the
  settings list does not ask for the PIN again.
- A one-shot prompt for an action answers that one action and starts no
  session.
- A device without `sell` starts on the PIN screen (home needs `sell`) and
  returns home, to it, when the session times out or the app goes to the
  background.

## Alternatives considered

A session only per screen: the owner walking through settings would enter
the PIN at every step.

## Consequences

Leaving the app is detected through `visibilitychange`; the end-to-end
test fires that event rather than really backgrounding a browser.

## Enforced by

- `e2e/access.spec.ts > a PIN session ends after five minutes without activity`
- `e2e/access-gates.spec.ts > a PIN session ends on a screen the device covers itself, and in the background`
- `e2e/access-gates.spec.ts > a device without sell returns to its PIN screen when the session times out`
- `e2e/access-gates.spec.ts > switching account ends the PIN session, also when switching back`
- `e2e/access-gates.spec.ts > every cart write that takes items off the bill asks a Basic device for the PIN`
- `src/core/modules/access/access-utils.test.ts > effectivePermissions > are every permission with a PIN session`
