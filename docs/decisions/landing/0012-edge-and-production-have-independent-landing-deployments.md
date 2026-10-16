# 0012 Edge and production have independent landing deployments

Status: accepted
Date: 2026-10-16

## Context

Landing/0011 separates the marketing workspace and deployment from the app.
Its single upstream would show production marketing pages on edge as well,
preventing landing changes from being checked on edge before publication.

## Decision

The independent `apps/landing` workspace and the rendering, SEO, language,
theme and no-account guarantees retained by landing/0011 continue to apply.
Neither application imports the other's runtime source; shared browser
navigation and hooks belong to `packages/web-shared`.

Two Vercel projects build `apps/landing`: `payky-landing-edge` publishes
`main`, and `payky-landing` publishes `landing-production`. Moving the
landing production branch publishes marketing pages without an app release
or CalVer change.

The app origin retains `/landing`, its language and document paths and
assets, with `/sitemap.xml` proxied as well. `edge.payky.me` and the Vercel
aliases and previews of `payky-edge` use the stable `payky-landing-edge`
upstream. Other app hosts use `payky-landing`. Canonical and sitemap URLs
continue to name `https://payky.me/landing`. Contact, app installation
resources, service workers and `/robots.txt` stay with the corresponding app.

## Alternatives considered

One production landing for both apps: rejected because edge must show
landing changes before production. Per-PR landing pairing is unnecessary;
app previews use the landing published from `main`.

## Consequences

Deploy both landing upstreams before enabling the app proxies. Each landing
project can roll back independently. `landing-production` must contain the
workspace before its first build. Local development and E2E continue to run
both workspaces from one checkout behind the app's proxy.

## Enforced by

- `apps/landing/src/deployment.test.ts > landing deployment > pairs %s with %s`
- `apps/landing/src/deployment.test.ts > landing deployment > proxies landing pages, assets and sitemap before the app fallback`
- `apps/landing/src/deployment.test.ts > landing deployment > serves every prerendered language and document at its existing address`
- `apps/landing/src/deployment.test.ts > landing deployment > installs the existing app from the public origin`
- `apps/web-app/e2e/landing-redirect.spec.ts > the app origin serves the independent landing documents and assets`
- `apps/web-app/e2e/landing-redirect.spec.ts > the independent landing submits contact to the app origin`
