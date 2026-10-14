# 0008 The page on what makes Payky different is a landing document of its own

Status: accepted
Date: 2026-10-13

## Context

Payky differs from other payment apps in how it is built, not only in what
it does: the data lives on the device, there is no sign-up, the backup goes
through relays that cannot read it, and no Payky server stands between the
customer and the merchant's money. The home page says each of these in a
line. A merchant comparing apps, or anyone asked to trust one with a
business's takings, needs the whole explanation, and a search result needs
a page whose title and FAQ are about it.

## Decision

The page is a third landing document, built and served like the EET page
(landing/0006): Czech at `/landing/jak-to-funguje`, English at
`/landing/en/jak-to-funguje`, Slovak at `/landing/sk/jak-to-funguje`, each
with its own title, description, canonical and `hreflang` links, Czech as
`x-default`, and an `FAQPage` with its own questions. The slug is Czech in
every language, as `eet-2-0` is one slug for all three. It shares the
header and footer, not the closing section (landing/0010). The header's
menu does not list it; the footer of every landing page links to it, and
the home page's card on data staying with the merchant links to it.

The page reads as what makes Payky different, not as documentation: the
hero claims the difference, and under it one sale — two espressos paid by
QR code — is followed in four steps from the counter to a second till,
each step leading to its section. A table then compares Payky with a
typical cloud app row by row; that comparison is made once, and the
sections after it explain how Payky works instead of repeating it. Each
section's title states a difference: local-first (what works offline and
what completes once online), the account without registration (a sample
recovery phrase, and a table of what losing the phone, the phrase or both
costs, kept as the price of that freedom), backup and sync through relays,
the path of the money for each payment method (a QR payment step by step),
security and ownership of data, transparency (security through
transparency rather than obscurity: a black box stamped "trust us" against
a glass safe that stays locked, what makes the claims checkable, one claim
of the page followed to the decision and the test that hold it, and what
cannot be checked yet), the full list of services the app talks to, and what happens if Payky's servers go down (a table, feature by
feature) or Payky ends. Technical words get a plain comparison where they
first matter — the key to a safe with no locksmith, the relay as a post
office carrying sealed envelopes. The FAQ follows, then a call to try the app. The page claims to be
different from a typical cloud app, never the only or the first app of its
kind, which nobody here can check. The diagrams speak
the home page hero's language — round nodes, lines, sparks travelling
along them — with the labels in HTML from translated copy, so they are
prerendered and read by screen readers like the text, and only the lines
in SVG. Other apps are not named. What the page may
say is landing/0009.

## Alternatives considered

Longer sections on the home page: rejected for the reason landing/0006
gives, the home page would no longer read top to bottom.

Diagrams as images or SVG with text: rejected, each would need a copy per
language and would hide its labels from search engines and screen readers.

## Consequences

`bun run build` writes `landing-tech-<language>.html` beside the other six
files; `vercel.json`, `landingPagesPlugin` and `sitemap.xml` know the three
addresses. The section components the EET page and this page share (`Band`,
`SectionHeading`, `IconGrid`) live in `landing-parts.tsx`.

## Enforced by

- `src/landing-server.test.tsx > renderLandingDocument > prerenders the page on how Payky works in %s at its own address`
- `src/landing-server.test.tsx > renderLandingDocument > links the languages of the page on how Payky works to each other`
- `src/landing-server.test.tsx > renderLandingDocument > describes the FAQ of the page on how Payky works for search results and shows its answers`
- `src/landing-server.test.tsx > renderLandingDocument > follows a claim of the page on how Payky works to the decision and the test that hold it`
- `src/landing-server.test.tsx > renderLandingDocument > leads from the home page and the footer of every landing page to the page on how Payky works`
- `src/features/shared/landing-redirect.test.ts > isLandingTechPath > reads %s as the page on how Payky works: %s`
