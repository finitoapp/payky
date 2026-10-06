# 0002 The landing page is prerendered once per language

Status: accepted
Date: 2026-10-06

## Context

The landing page was a route of the app: it appeared only after the app's
script, Evolu and the device's theme had loaded, and its HTML was an empty
shell. Google renders scripts late and link previews (Facebook, LinkedIn,
Slack, X) never do, so a shared link showed no title or description. The
page picked its language in the browser, which static HTML cannot do: one
file has one language.

## Decision

The landing page is a document of its own, `landing.html`, built beside the
app and prerendered at build time once per language: Czech at `/landing`,
English at `/landing/en`, Slovak at `/landing/sk`. Each file carries its
own title, description, Open Graph tags, a canonical link to itself and
`hreflang` links to the others, with Czech as `x-default` (landing/0004), a share image
and structured data for search results: the app as a free
`SoftwareApplication` and the page's FAQ as an `FAQPage`. `robots.txt`
points at a `sitemap.xml` listing the three addresses. The browser
hydrates the prerendered page.

The address decides the language. Choosing another language on the page
moves to that language's page and remembers the choice; the redirect from
the app (landing/0001) goes to the remembered language, else to Czech
(landing/0004). A visitor who opens a language's address is never moved to
another one.

The page loads no account. Its appearance is its own choice, kept in the
browser and applied before the first paint, not the app's theme; its
contact form runs its one request on a run of its own and says a failure
next to the button. It links to the app with plain links. The service
worker neither precaches the landing pages nor answers their addresses
with the app's shell.

## Alternatives considered

One prerendered language with the browser switching to the visitor's after
loading, which was rejected because visitors in the other languages would
see the page change under them and search engines would index one
language only.

Moving the visitor to their browser's language on any landing address,
which was rejected because a crawler and a shared link must get the
language the address names.

A prerendering plugin or a static site framework, which was rejected:
React renders the page to a string on its own, and the build needs one
short script for it.

## Consequences

`bun run build` builds the app, then a server bundle of the landing page,
then writes `landing-cs.html`, `landing-en.html` and `landing-sk.html`;
`vercel.json` maps the three addresses onto them, and the dev and preview
servers do the same. The native build has no landing page. The landing
page and the app may show different themes on one device. Anything the page
renders must render the same without a browser: a value read from the
browser shows up after hydration, as the feature story's wide layout and
the remembered theme do. The share images are made from the Twitter header, which
has no Slovak version yet, so the Slovak page shares the Czech one.

## Enforced by

- `src/landing-server.test.tsx > renderLandingDocument > prerenders the page in %s at its own address`
- `src/landing-server.test.tsx > renderLandingDocument > links every language's page to the others`
- `src/landing-server.test.tsx > renderLandingDocument > describes the app and the page's FAQ for search results`
- `src/features/shared/landing-redirect.test.ts > landingLanguageFromPath > reads %s as %s`
- `e2e/landing-redirect.spec.ts > switching the landing page's language moves to that language's page`
- `e2e/landing-redirect.spec.ts > a new browser visitor lands on the landing page until they open the app`
