# 0003 The app starts in the landing page's language

Status: accepted
Date: 2026-10-06

## Context

The landing page's language is the one its address names (landing/0002),
and a visitor may have picked it there. The app's language is a device
setting, written once with the browser's language when the device
database is first created. A new visitor reaches the landing page through
the app's address (landing/0001), which creates that database before the
redirect, so a visitor reading the Czech landing page in an English
browser was then onboarded in English.

## Decision

The landing page's button into the web app opens `/onboarding?lang=<its
language>`. Onboarding sets the device's language to it when the device
has no account yet, then drops the parameter from the address, so a reload
or Back does not undo a language picked in onboarding meanwhile. A device
with an account keeps its language and goes on to the app.

## Alternatives considered

Setting the language for every device, which was rejected because a
merchant whose app is set up would have it switched by reading the landing
page in another language.

Reading the language the landing page remembers in `localStorage`, which
was rejected because it is written only when the visitor switches
languages, not for the page they simply opened.

## Consequences

Only the landing page's button carries the language: a visitor who types
the app's address keeps the browser's language. The device locale follows
the language when onboarding finishes, as it already did.

## Enforced by

- `e2e/landing-redirect.spec.ts > the app starts in the language of the landing page it was opened from`
- `e2e/landing-redirect.spec.ts > a device with an account keeps its language when opened from the landing page`
