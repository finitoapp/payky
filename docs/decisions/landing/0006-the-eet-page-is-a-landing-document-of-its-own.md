# 0006 The EET 2.0 page is a landing document of its own

Status: accepted
Date: 2026-10-13

## Context

EET 2.0 starts on 1 January 2027 (eet.gov.cz, harmonogram) and now covers
card and QR payments taken in person, not only cash, so merchants who never
had to record sales go looking for what it means and which app does it.
The home page gives EET one card and one FAQ answer; a competitor
(eetujeme.cz/eet-2-0) has a page of its own for it. A search result needs a
page whose title, description and FAQ are about EET, and the explanation —
the law in brief, the steps at the tax office, the steps in Payky — is too
long for a section of the home page.

## Decision

The EET page is a second landing document, built from the same
`landing.html` template and prerendered once per language like the home
page (landing/0002): Czech at `/landing/eet-2-0`, English at `/landing/en/eet-2-0`,
Slovak at `/landing/sk/eet-2-0`. Each has its own title, description, canonical
link, `hreflang` links to the EET page in the other languages, Czech as
`x-default`, and an `FAQPage` with the page's own questions. It shares the
home page's header and footer (the closing section, install and contact
form, stays on the home page since landing/0010);
choosing another language on it moves to the EET page in that language.
The home page's EET card links to it.

The page leads with Payky: right after the hero come the six steps in
Payky's EET settings, with the sandbox as the way to try it before
registration opens, and what Payky does on its own. The law in brief
follows (dates, who records what, the three steps in DIS+ the settings
need, what is new, EET OFF), then the FAQ. The Administration's own MOJE
eet app is not mentioned: the page is about Payky, not a comparison. What it may say is landing/0007.

## Alternatives considered

A Czech-only page, since the law is Czech: rejected because every visible
label is translated into all three languages anyway, and English and Slovak
speakers run businesses in Czechia too; the English and Slovak pages say
the law is Czech.

A long section on the home page: rejected, the home page would no longer
read top to bottom, and a search engine would still rank one page for two
topics.

## Consequences

`bun run build` writes six files: `landing-<language>.html` and
`landing-eet-<language>.html`. `vercel.json`, the dev and preview servers
(`landingPagesPlugin`) and `sitemap.xml` know the three new addresses. A
change to the shell (header, footer) changes both pages.

## Enforced by

- `src/landing-server.test.tsx > renderLandingDocument > prerenders the EET page in %s at its own address`
- `src/landing-server.test.tsx > renderLandingDocument > links the EET page's languages to each other`
- `src/landing-server.test.tsx > renderLandingDocument > describes the EET page's FAQ for search results and shows its answers`
- `src/landing-server.test.tsx > renderLandingDocument > leads from the home page to the EET page`
- `src/features/shared/landing-redirect.test.ts > landingLanguageFromPath > reads %s as %s`
- `src/features/shared/landing-redirect.test.ts > isLandingEetPath > reads %s as the EET page: %s`
