# 0001 A new browser visitor sees the landing page first

Status: accepted
Date: 2026-10-06

## Context

The app and the landing page share one origin: the terminal is at `/` and
the landing page at `/landing`. Links people share point at `/`, so until
now a visitor who did not know Payky was dropped straight into onboarding.
Merchants already using Payky open `/` too, from bookmarks, from an
installed PWA whose `start_url` is `/`, and in the Capacitor app, and they
must never be sent to a marketing page. Whether a device has an account is
known only once Evolu has loaded and the first sync settled, which is when
the terminal layout already decides to send an account without settings to
onboarding.

## Decision

Where the terminal layout sends a device without an account to onboarding,
it sends it to `/landing` instead when all of these hold: it is not the
Capacitor app, it is not an installed PWA (`display-mode: standalone`, or
`navigator.standalone` on iOS), and this browser has never opened
onboarding. Onboarding marks the browser in `localStorage` as soon as it
opens, and the landing page's web-app button leads to `/onboarding`, so a
visitor who left the landing page for the app is not sent back to it, even
before finishing onboarding. A device with an account never reaches this
decision.

## Alternatives considered

Moving the app off `/` and serving the landing page there, which was
rejected because installed PWAs keep their `/` start URL (iOS never
refreshes the manifest) and existing merchants would land on the marketing
page.

Putting the landing page on its own domain, which was rejected because
Evolu's data lives in the origin's OPFS: moving the app would make every
merchant restore their account.

Keeping the "opened the app" mark in the device Evolu database, which was
rejected because it loads asynchronously and losing the mark costs only one
more look at the landing page, which is what `localStorage` is allowed for.

## Consequences

A new visitor waits for Evolu to load and the first sync to settle before
the landing page appears. A browser with blocked or cleared storage sees
the landing page again on its next visit to `/` without an account. Typing
`/onboarding` skips the landing page.

## Enforced by

- `src/features/shared/landing-redirect.test.ts > shouldRedirectToLanding > sends a browser tab that never opened the app to the landing page`
- `src/features/shared/landing-redirect.test.ts > shouldRedirectToLanding > keeps %s out of the landing page`
- `e2e/landing-redirect.spec.ts > a new browser visitor lands on the landing page until they open the app`
- `e2e/landing-redirect.spec.ts > an installed PWA without an account goes straight to onboarding`
