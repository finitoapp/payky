# 0011 The landing site is deployed independently

Status: superseded by landing/0012
Date: 2026-10-16

## Context

Marketing pages need to ship without releasing the payment app. They were
already separate prerendered documents, but their source, build and Vercel
deployment belonged to `apps/web-app` (landing/0002).

## Decision

`apps/landing` owns the marketing site and its React/Vite prerendering,
translations and static assets. A separate Vercel project builds it with
`bun run build:landing`. The app's release and version remain independent.

The public addresses stay on the app's origin, at `/landing` and its
existing language and document paths. The web-app Vercel project proxies
that namespace, including assets, to the landing project's stable production
address before its SPA fallback. It also proxies `/sitemap.xml`; `/robots.txt`
stays with the app and points to that public sitemap.

All rendering, SEO, language, theme and no-account guarantees of landing/0002
continue to apply. The landing site's manifest and app icons remain owned by
the web app, at their existing root addresses. The contact API stays there,
too. Neither application imports the other's runtime source. The small
`@payky/web-shared` package owns the navigation/storage contract and browser
hooks used by both. Landing UI primitives are independent, unchanged copies
of the installed vendor files, maintained through its own registry config.

## Alternatives considered

A common deployment of separate workspaces: rejected because landing edits
would still require deploying the app. A framework migration: unnecessary
for the existing static prerendering.

## Consequences

Deploy the landing origin before enabling the web-app proxy. Rollbacks are
per project. A fixed production upstream intentionally shows production
landing in app previews; testing a paired preview requires changing that
preview's upstream. Local development and E2E tests run both Vite servers,
with the web server proxying the landing server to preserve one origin.

## Enforced by

- `apps/landing/src/deployment.test.ts > landing deployment > serves every prerendered language and document at its existing address`
- `apps/landing/src/deployment.test.ts > landing deployment > proxies landing pages, assets and sitemap before the app fallback`
- `apps/landing/src/deployment.test.ts > landing deployment > installs the existing app from the public origin`
- `apps/landing/src/landing-server.test.tsx > renderLandingDocument > prerenders the page in %s at its own address`
- `apps/web-app/e2e/landing-redirect.spec.ts > the landing page installs the app, which starts in the page's language`
- `apps/web-app/e2e/landing-redirect.spec.ts > the app origin serves the independent landing documents and assets`
- `apps/web-app/e2e/landing-redirect.spec.ts > the independent landing submits contact to the app origin`
