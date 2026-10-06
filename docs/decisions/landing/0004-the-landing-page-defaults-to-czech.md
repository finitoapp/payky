# 0004 The landing page defaults to Czech

Status: accepted
Date: 2026-10-06

## Context

The redirect from the app's address to the landing page (landing/0001)
picked the language remembered from the landing page, else the browser's
(landing/0002). Payky is built for Czech and Slovak merchants and the page
is written for them first, but a Czech merchant on a phone or computer set
to English was shown the English page.

## Decision

Without a language picked on the landing page before, the redirect goes to
the Czech page, whatever the browser's language. A language picked on the
page is still remembered and used. Search engines get the Czech page as
`x-default`, in the pages' `hreflang` links and in the sitemap.

## Alternatives considered

The browser's language, as before, which was rejected because most
visitors are Czech merchants whose devices are often set to English.

## Consequences

An English or Slovak visitor lands on the Czech page and switches language
there once; the choice is remembered for the next redirect. The device
language the app starts in follows the landing page's (landing/0003), so a
visitor who never switches is onboarded in Czech.

## Enforced by

- `src/features/shared/landing-redirect.test.ts > preferredLandingLanguage > is Czech whatever the browser's language`
- `src/features/shared/landing-redirect.test.ts > preferredLandingLanguage > is the language picked on the landing page before`
- `e2e/landing-redirect.spec.ts > a new browser visitor lands on the landing page until they open the app`
- `src/landing-server.test.tsx > renderLandingDocument > links every language's page to the others`
