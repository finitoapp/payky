# 0010 Only the home page ends with installing and contact

Status: accepted
Date: 2026-10-13

## Context

The EET page (landing/0006) and the page on how Payky works (landing/0008)
ended with the home page's closing section: the ways to install Payky and
the contact form. Each page already ends with its own call to try the app,
so the closing repeated it at more length, and the contact form sat at the
bottom of three pages without being easy to find from any of them.

## Decision

Only the home page ends with the closing section. The EET page and the page
on how Payky works end with their own sections, the FAQ and their call to
try the app, then the footer. The header's menu gains a last item,
"Contact", that leads to the home page's contact form (`#contact`) in the
page's language, from every landing page.

## Alternatives considered

Keeping the contact form on every page: rejected, a form repeated at the
bottom of each page is still at the bottom; one menu item reaches it from
the top of any page.

## Consequences

Installing Payky is explained on the home page only; the subpages lead into
the app directly. A change to the closing section changes the home page
alone.

## Enforced by

- `apps/landing/src/landing-server.test.tsx > renderLandingDocument > ends only the home page with installing and contact, and leads to the contact form from the menu`
